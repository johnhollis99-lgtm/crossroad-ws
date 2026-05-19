# XRoad — Claude Code Project Context

## App identity

XRoad (rebranded from RoadStory 2026-05-04) — GPS-triggered AI narration for road trips and hikes.
Package/slug names still say "roadstory" internally; all user-facing strings say "XRoad".

## Design docs (`docs/`)

Authoritative product + system design lives under [docs/](docs/). Read order when starting a new session is in [docs/README.md](docs/README.md). The five canonical docs:

- [docs/SKILL.md](docs/SKILL.md) — project skill (tech stack, audience modes, narration depths, conventions). Mirror of the claude.ai SKILL artefact; see the **Mirror note** later in this file for the sync protocol.
- [docs/roadstory-narration-curation-addendum.md](docs/roadstory-narration-curation-addendum.md) — **authoritative current model**: two narrators (`narrator_a/b`), intrinsic POI depth (brief/standard/long + `long_compressed` Light-Touch variant), Pace as user setting, 70 significance floor, Regions as parallel narration layer, Iconic Local Override, skip/Tell-Me-More feedback loop. Read before any code touching narration generation, lookahead, voice configs, or trip setup UI.
- [docs/roadstory-unified-roadmap.md](docs/roadstory-unified-roadmap.md) — single source of truth for sequencing across all pending work. §11 of the addendum + §4 of the roadmap are both migration-order references.
- [docs/roadstory-poi-pipeline-prompts.md](docs/roadstory-poi-pipeline-prompts.md) — phased POI ingestion playbook (OSM, Wikidata, NRHP, CHL, GNIS, narrative extraction).
- [docs/venue-tour-design.md](docs/venue-tour-design.md) — Venue Tour parent/child mode spec (theme parks, missions, campuses); now addendum-aware after the 2026-05-14 update.

Plus operational docs already in `docs/`: [data-quality-issues.md](docs/data-quality-issues.md), [drift-catalog.md](docs/drift-catalog.md), [audit-*.md](docs/), [db-snapshot-*.md](docs/), and the Pine design prompts at [docs/pine/](docs/pine/).

## Pine redesign — current direction (landed 2026-05-14)

Pine **fully supersedes Field Notes** per Claude Design clarification — single dark theme, near-black surfaces, emerald + cobalt + danger-rose accent system. The "Design system — Field Notes" and "Field Notes brand chip family + map integration" sections further down in this doc are **historical context only**; do not reference them for current design decisions.

### Commit chain on `origin/main`

- `880b807` — Foundation: Pine tokens + theme.ts (single dark + CVD swap) + fonts.ts (Instrument Serif + DM Sans) + 17 components rebuilt + 6 new Phase-2 atoms + Customize full rebuild + Drive full rebuild + app/index.tsx token migration
- `e9a2659` — Paper surfaces swapped from forest-green to near-black per user preference
- `160b88a` — POI marker visual upgrade (target ring + bicolor X + cream halo for cross-map visibility) + sonar pulse on the active POI in drive + user-location halo pulse
- `c85b562` — Cluster pill auto-width attempt + home top-header consolidated into a single rounded card with chip rail below
- `7325b58` — Cluster marker rebuilt as a **pin shape with explicit calculated widths** (the pill auto-width was racing Marker bitmap snapshots — see "Marker auto-sizing gotcha" below)
- `05c0b39` — Home chip rail removed; customize is sole UI for category selection
- `782dab1` — Cluster markers re-architected View-based → **PNG-based** via react-native-svg `toDataURL`, bypassing Android's `Marker.captureView()` race. Loses cluster animation as documented tradeoff.
- `b681329` — Customize: unified header card matching home pattern (nav row + Strip A + Strip B all in one paperSoft card; map peek shrunk 240→200, no longer carries overlays; MapStylePicker re-ordered as last child of root for paint-order)
- `128fe0f` — `key={mapStyleId}` on customize's MapView so style change clears `customMapStyle` on Android (mirrors home/drive pattern; required for array→undefined transition)
- `a10cee5` — `lib/mapStyle.ts` AsyncStorage persistence on native (previously web-only); map-style preference survives cold start on iOS/Android
- `2c35393` — SVG swatch thumbnails restored to MapStylePicker dropdown rows (reverses drift 5.98's text-only treatment); single-file change, no Mapbox network calls

### Palette (sole source: `src/design/tokens.ts`)

```
paper             #0A0A0A   near-black canvas
paperSoft         #141414   text-on-accent + low-elevation surface
paperWarm         #1E1E1E   search field, active tab pill
paperEdge         #2E2E2E   borders / dividers

ink               #E8FAEF   body text, icon stroke
inkSoft           #9ACCB0   secondary text
inkFaint          #5E907C   tertiary / decorative only

line, lineSoft    rgba(232,250,239, 0.22 / 0.10)

primary           #10B981   emerald — primary CTAs, route polyline, POI X glyph fill
primaryDeep       #059669
primaryTint       rgba(16,185,129,0.14)
primaryTintEdge   rgba(16,185,129,0.28)

secondary         #60A5FA   cobalt — icon accent, Add stop pill, user-location dot
secondaryDeep     #3B82F6
secondaryTint     rgba(96,165,250,0.14)
secondaryTintEdge rgba(96,165,250,0.28)

cvdSafe           #F59E0B   amber — CVD-safe accent (swaps in for cobalt when CVD toggle on)

danger            #E11D48   rose — End trip, destructive CTAs
dangerDeep        #BE123C
dangerTint        rgba(225,29,72,0.16)
```

Note: the original Pine prompt specified `paper` = #08160F (forest-green tinted). Implementation swapped to neutral near-black per user feedback after Phase 2 landed.

### Type ramp (`textVariants` in `src/design/tokens.ts`)

`display` (32 italic) / `displaySmall` (26 italic) / `title` (22 italic) / `titleSmall` (20 italic) over **Instrument Serif italic**, plus `label` (14/700) / `body` (14/600) / `meta` (12/500) / `eyebrow` (10/700 UPPERCASE tracked) over **DM Sans**. Mono inline coords use **JetBrains Mono**.

Phase-1 Field-Notes-era ramp keys (`h1`, `h2`, `h3`, `button`, `buttonStrong`, `ui`, `uiSmall`, `metaSmall`, `bodyItalic`) are gone — migrated by name during the app/index.tsx bulk token migration in commit `880b807`.

### CVD-safe toggle

`ThemeProvider` (in `src/design/theme.ts`) exposes `{ theme, cvdSafe, setCvdSafe }`. The `theme.colors.accent` token is CVD-aware: cobalt by default, amber when `cvdSafe === true`. Other secondary tokens (`secondary`, `secondaryDeep`, `secondaryTint`) stay cobalt regardless — only icon-accent semantics swap. Persisted via AsyncStorage key `xroad.cvdSafe`.

### Motion (`src/design/motion.ts`)

Three hooks, all gated on `AccessibilityInfo.isReduceMotionEnabled()`:

- `useBreath({ min, max, duration })` — opacity loop. Used by the Trip XRoad watermark X (`min: 0.55, max: 0.95, duration: 2800`).
- `useSonar({ duration, delay })` — Pine spec section 6 `sonarRing` (scale 0.6 → 2.5, opacity 0.7 → 0, 2.8s). Returns `{ scale, opacity }` interpolations. Used on the active POI marker in drive (two rings, second delayed 1.4s for the sustained double-ripple).
- `useUserHalo({ duration })` — Pine spec `userHalo` (scale 1.0 → 1.5, opacity 0.22 → 0.06, 2.2s). Used on the user-location dot in drive.

Cluster bubble has its own opacity-only glow loop inline in `ClusterMarker` (didn't need a shared hook — single consumer, opacity-only so the per-frame bitmap diff stays minimal).

### Pine screens (Pine-themed, current)

| Screen | File | State |
|---|---|---|
| Home | `app/index.tsx` | Pine palette + **single-card top header** (squiggle + Wordmark + avatar in row 1, ModePillRow in row 2, "Where to?" search in row 3). **Category chip rail removed in commit `05c0b39`** — customize is sole UI for category selection; home's RPC chain still consumes `selectedCategories` from the Zustand store. Legacy bottom-sheet content (search results + customize CTA) still in place — Phase 3 rebuild target. |
| Customize | `app/customize.tsx` | Full Pine rebuild + **unified header card (commit `b681329`)**: full-width paperSoft card with squared top corners / rounded bottom that touches the status-bar inset, carries `STATUS_TOP` paddingTop itself. Row 1: 40px back button + Wordmark + 40px spacer slot. Row 2: route-summary inline (origin → dest · duration). Row 3: 4-col `TripStat` strip (DISTANCE / DURATION / POIS / PACE) with hairline borders — POIS + PACE live-bound to `curatedCount` / `avgPaceMin`. Below the card: 200px non-interactive map peek (overlays removed; just MapView + Polyline + dest marker + bottom fade gradient). ScrollView holds: narration-depth `SegmentedTrio`, 2×2 NarratorCard grid (Pine avatar palette: emerald / lilac / cobalt / amber), Categories horizontal CategoryChip row, Density `SegmentedTrio`, Min relevance + POI distance `LabeledSlider`s. Sticky emerald Start trip CTA at bottom. `MapStylePicker` is rendered as the LAST child of the root View (paint-order workaround so its dropdown panel renders above the map peek). All handlers preserved. MapView carries `key={mapStyleId}` (commit `128fe0f`) so customMapStyle clears correctly when switching from dark on Android. |
| Trip / drive | `app/drive.tsx` | Full Pine rebuild: emerald polyline + cobalt user-location dot with `useUserHalo` pulse + PersonaPill + StoriesBadge + 3-column TripStat card + retracted/deployed sheet states + breathing watermark X via `useBreath` + media controls + Up next queue + LabeledSlider story corridor + ModePillRow + Quiet pill + danger End trip pill. All handlers preserved (Audio, Socket.io, GPS, POI load + curation, queue, skip back/forward, end trip). |

### Legacy screens (still on brown `C` palette from `lib/theme.ts`)

`app/filters.tsx`, `app/driving.tsx`, `app/hiking.tsx`, `app/trail.tsx` + `.web` shims — Phase 3 / D2 migration target. Will look brown-tinted alongside the Pine screens until migrated.

### Pine component primitives (Pine-themed, ready to consume — all in `src/components/`)

Foundation atoms — `Wordmark` (optional `squiggle` prop for the home decoration), `Card`, `CategoryChip` (accepts optional `icon` slot for the category glyph), `SegmentedControl`, `SegmentedTrio`, `PrimaryButton`, `DangerButton`, `Kicker`, `FieldNotesDivider`, `GlassPill`, `OfflineBadge`, `AudienceMark`, `NarrationCard`, `Waveform`, `ModePillRow`.

Phase-2 additions — `LabeledSlider`, `NarratorCard`, `PersonaPill`, `StoriesBadge`, `TripStat`.

Map primitives — `PoiCallout`, `CoordinatesPill`, `PoiMarkerX` (40×40 wrapper, thin emerald target ring + bicolor X glyph with cobalt outline + cream halo via paintOrder).

Icon library (`Icons.tsx`) — 22 duotone SVGs with a common `{ size, color, accent }` API: ArrowLeft, Play, Pause, SkipBack, SkipFwd, Volume, VolumeOff, Mic, Sparkle, Car, Hike, Close, History, Nature, Architecture, Food, Music, Art, Weird, Roadside, Film, Science. When `accent` is omitted it falls back to `color` for mono rendering — matching the spec's `var(--ax, currentColor)` pattern.

Demo screens — `src/design/DesignSystemScreen.tsx` (palette + type ramp, default vs CVD-safe side-by-side panels), `src/components/ComponentsDemoScreen.tsx` (every component variant in one scroll with a CVD toggle pinned at top).

### Map-marker discipline (current)

**POI markers** (`PoiMarkerX`) must still be inlined as `<Marker>` children directly under `<ClusteredMapView>` (drift 5.94 — the clusterer's `isMarker` helper reads the `coordinate` prop directly off JSX children; function-component wrappers hide it). Wrap each POI's Marker with a `coordinate` prop; PoiMarkerX is the visual child.

**Cluster markers** (`ClusterMarker` in `app/index.tsx`) — **PNG-based** (commit `782dab1`). The marker renders `<Marker image={{ uri }} />` with a base64-PNG fed by an in-memory cache keyed by count. PNGs are rasterized via `react-native-svg`'s `toDataURL()` from a hidden `<Svg>` off-screen (positioned `top:-1000, opacity:0, pointerEvents:'none'`), via a sequential queue with a two-`requestAnimationFrame` settle. Cache: module-level `Map<number, string>` + LRU cap 500 + a `Set` of listeners for re-render notification. Pre-warm: counts 5–50 on MapScreen mount. Counts >50 lazy-rasterize on first sight (~5-20ms, one-frame flicker tolerated). `ClusterMarker` renders `null` while its count is being rasterized — pre-warm covers ~95% of real-world clusters so the blank window is rare. `tracksViewChanges` is permanently `false` — the image is a static native bitmap, nothing to track. Anchor `{ x: 0.5, y: 0.92 }` preserved bit-for-bit from the previous pin shape so on-screen positions don't shift. SVG composition mirrors the previous pin visual (halo + static glow at 0.30 opacity + pill head + paperSoft border + highlight + count + downward triangle pointer); cluster animation (the opacity-pulse glow) is the documented tradeoff. See **"Marker auto-sizing gotcha"** below for the full arc that led here.

**Active POI in drive** — `ActivePoiMarker` in `app/drive.tsx`: paperSoft disc + emerald border + X glyph + two staggered sonar rings via `useSonar`. `tracksViewChanges` stays `true` for the active marker only (so the rings keep animating); inactive POI markers retain the drift-5.94 flip-to-false-after-1s discipline so 30+ static markers don't churn the GPU.

**User location dot in drive** — `UserLocationMarker` in `app/drive.tsx`: secondaryDeep dot + animated outer halo via `useUserHalo`. `tracksViewChanges` true.

### Marker auto-sizing gotcha (load-bearing for future cluster work)

`react-native-maps` Markers with custom View children **do not reliably honor flex auto-width** when the content includes `<Text>` whose width depends on RN's layout-measurement pass. The Marker bitmap can snapshot before Text measures, freezing a clipped state. The earlier cluster pill (commit `c85b562`) had this problem — auto-width pills clipped 4+ digit counts despite mathematically having room. First fix attempt: compute widths explicitly from `digits × charWidth + padding` (commit `7325b58`). Documented in `memory/feedback_marker_auto_width_clipping.md`.

**The explicit-width fix proved insufficient on hardware.** A multi-attempt debug arc (View-pill / SVG-pill dynamic-width / SVG-pill fixed-canvas with `collapsable={false}` + `renderToHardwareTextureAndroid` / StyleSheet-with-fixed-dims pin) reproduced the same clipping symptom across every composition variant. The clipping is **downstream of the React View layer entirely** — in `react-native-maps`' Android `Marker.captureView()` bitmap-snapshot pipeline. Neither inline-vs-StyleSheet styling nor dynamic-vs-fixed dimensions on the wrapper affect it. The bug is unreachable from JS-land. Compounded on Android by MapView's `SurfaceView`, which can punch through RN's view-tree paint order regardless of elevation.

**The resolution (commit `782dab1`)** is to bypass `captureView` entirely by feeding the Marker a pre-rasterized PNG via the `image` prop. See the **Cluster markers** bullet above for the full architecture. The pre-PNG iterations are preserved as historical sessions in the chain (`c85b562` → `7325b58` → working-tree experiments stashed during the arc, since dropped). **Future cluster work that wants animation back will have to either reverse the PNG decision (and re-inherit this bug class) or move to a marker library that doesn't have the same Android capture race** — `react-native-mapbox-gl` and `react-native-maps`'s upcoming new arch are both candidates, neither is a small migration.

### Phase 3 — still open

Tracked in `memory/project_phase_3_pine_followups.md`:

1. **Home bottom sheet rebuild** — Route / Saved / Recent tabs, route summary card with progress bar + ★ rating chip, stops list with colored circle markers + drag grips, "+ Add stop" cobalt pill. Plus right-rail map controls (Compass / Layers / + / -) and recenter FAB above the sheet edge.
2. **Legacy-screen palette migration** — filters / driving / hiking / trail (+ .web shims) off `lib/theme.ts` `C` palette to Pine. Each is a per-file mechanical token-flip with ~9–43 inline hex literals + ~12–17 rgba() literals to migrate.

### Source-of-truth Pine prompts (committed)

Saved at `docs/pine/`:
- `CLAUDE_CODE_PROMPT.md` — Phase 1 (home + tokens + components + motion + a11y + duotone icons)
- `CLAUDE_CODE_PROMPT_PHASE2.md` — Phase 2 (customize + trip + danger token + new atoms)
- `design-tokens.json` — canonical token values (matches `src/design/tokens.ts`)
- `README.md` — implementation status, deviations from the prompts (paper-color swap, RN port of CSS motion, etc.)

## Stack

- **Frontend:** React Native / Expo (TypeScript) — all UI hand-coded as standard RN. EAS Build for iOS/Android binaries, EAS Update for OTA. One codebase compiles to both platforms.
- **Navigation:** `createNativeStackNavigator` in App.tsx (NOT Expo Router). All new screens must be registered there. No `app/_layout.tsx`; no `expo-router` import anywhere in source (transitive peer-dep references in `node_modules/.package-lock.json` only). Entry chain: `index.ts` → `registerRootComponent(App)` → `App.tsx` → `<NavigationContainer><Stack.Navigator>…</Stack.Navigator></NavigationContainer>`. First registered `Stack.Screen` (`"index"`) is the default boot route (no `initialRouteName` set).
  - Registered: index, filters, customize, drive, driving, hiking, trail, design-system, components-demo
  - `design-system` and `components-demo` are `__DEV__`-only demo screens (still always-registered routes — gating is at the nav-button level inside `app/index.tsx`, not at registration). See "Design system" section below.
- **Backend:** Supabase + PostGIS, Node.js + Express + Socket.io on :3001
- **Maps:** Google Maps / Directions / Elevation (native); Mapbox shim for web
- **LLM:** xAI/Grok; TTS is provider-abstracted via `scripts/lib/tts/`. Primary provider is Google Cloud TTS. ElevenLabs, OpenAI, Polly, and self-hosted are pluggable but inactive.
  - **TTS provider roadmap (locked 2026-05-18):** v1 ships with Google Chirp 3 HD for cost reasons (~$16/M chars vs ElevenLabs ~$0.30/1k chars ≈ 18× cheaper at scale). **Production target is ElevenLabs** for voice quality. The re-render path when ElevenLabs lands is a `voice_configs` swap-and-deactivate (set existing Google rows `is_active=false`, insert new ElevenLabs rows at version+1, kick a precache re-run) — **NOT a migration**. The cache key shape (`{poi_id|region_id}/{narrator_slug}.opus`) is provider-agnostic. Defer the swap until late-pre-launch or post-launch.
- **Design tokens:** Two palettes coexist during the migration. (a) `src/design/tokens.ts` → Field Notes (Phase 1, landed 2026-05-12 in commit `98d8243`) — light/dark palette, type ramp, spacing, radii. Consumed by `src/components/**`, `components/MapStylePicker.tsx` (post drift 5.98), and any newly-migrated screen. Sole source of truth for new color / type values. See "Field Notes brand chip family + map integration" section below for the cream-chip-on-map posture that anchors most home-screen branded surfaces. (b) Legacy `lib/theme.ts` → `C` object (dark earthy palette) — still consumed by every screen in `app/**` and by `components/XRoadLogo.tsx` (legacy, unused after drift 5.92 — kept on disk pending an explicit delete). `lib/mapStyle.ts` → `MAP_STYLES` (untouched by the design system).

## Screen flows

```
index.tsx → customize.tsx → drive.tsx     (narrator-aware driving — primary flow)
index.tsx → filters.tsx   → driving.tsx   (legacy flow, still functional)
hiking.tsx → filters.tsx (mode='hiking') → trail.tsx

index.tsx → design-system     (DEV-only — [DS] nav button, __DEV__ && !isDesktop)
index.tsx → components-demo   (DEV-only — [CD] nav button, __DEV__ && !isDesktop)
```

## Hard rules — never break these

**Units:** Miles and feet only in any user-facing text. Meters only for internal calculations and DB storage. Never show "km" or "m" to the user.

**DB architecture:** Always reuse existing Supabase tables and RPC functions. Do not create parallel or shadow tables for new features. Extend with new columns / RLS policies / updated RPC params instead.

**`updated_at` trigger reuse:** When a new table needs an `updated_at` column auto-touched on UPDATE, attach the existing `public.set_updated_at()` function via a BEFORE UPDATE trigger. Do not create a parallel trigger function. The shared function was captured in migration `20260510000001_user_preferences_capture.sql`; today its only consumer is `user_preferences`, but the generic name signals "reuse me." See drift catalog 5.24.

**Category slug mapping:** UI labels ≠ DB slugs. The `get_corridor_pois` RPC filters by `c.slug = ANY(category_filter)` (case-sensitive). Always apply `CAT_SLUG` mapping from `app/customize.tsx` before any RPC call:
- History→history, Nature→nature, Architecture→architecture
- Food→food_drink, Music→local_culture, Weird→hidden_gems
- Roadside→local_culture, Film→art, Science→geology

**Aspirational poi_categories slugs:** Some `poi_categories` rows exist as
narrative-extracted / editorial-only buckets that the bulk importers will never
populate (no clean OSM/Wikidata signal). They get rows from the admin app
review queue or from narrative-extraction, not from `osm.ts`/`wikidata.ts`/etc.
Currently reserved: `legends`, `native_history`. Do NOT add OSM/Wikidata rules
in `scripts/poi-import/lib/category-map.ts` for these — they would need a
hand-tuned heuristic that's outside the scope of the importer pipeline.

**Mobile category chips MUST be derived dynamically.** The customize/filters
screens should query `poi_categories` filtered to slugs with `EXISTS (SELECT 1
FROM pois p WHERE p.category_id = pc.id AND p.merged_into IS NULL)`. Hardcoding
the full taxonomy (as `app/customize.tsx`'s `ALL_CATEGORIES` does today) makes
empty slugs render as dead chips users can't get any results from. Tracked in
`docs/audit-poi-categories.md`.

**Scenic badge:** Never assign "Scenic" by elimination. Only award it when a route has strictly more POIs than the fastest route (`poiCount`). If POI data is null, show no badge.

**Mobile-only:** No desktop UI. Design at 390×844 (iPhone) / 412×915 (Android). Touch targets ≥ 64pt on the Drive screen.

**Drive screen safety:** No primary info as readable text while driving. "End trip" always visible and oversized. No nested menus on Drive.

**Dimensional model (the canonical "mode" disambiguation):**

"Mode" is overloaded in this codebase. Two distinct axes both use the
column name `mode`: audience mode (personality) on `voice_configs`, and
trip mode (driving/hiking/city) on `narration_audio`. In prose, always
use `audience_mode` or `trip_mode` explicitly. The literal column
references self-qualify by the table they sit on, so the columns
themselves don't need renaming.

| Column | Semantic | Value space |
|---|---|---|
| `voice_configs.mode` | audience mode | family / kids / unfiltered / local |
| `narration_audio.mode` | trip mode | driving / hiking / city |
| `narration_audio.narrator_slug` | voice id | per-voice slug |
| `narration_audio.depth` | depth | glance / ride_along / deep_dive |
| `trips` | no mode column today | depth + category_filter only |

Operational notes:
- `voice_configs.mode` enforces "one active row per audience mode" via the partial unique index `(mode) WHERE is_active = true`.
- `narration_audio.mode` is enforced by CHECK on `('driving','hiking','city')`. The catalog's planned 4th value `venue_tour` requires a separate CHECK extension.
- `user_preferences.default_audience_mode` shares the audience-mode value space and CHECK constraint.
- Cache key shape: `{poi_id}-{trip_mode}-{depth}-{narrator_slug}.opus`. Audience mode is collapsed into `narrator_slug` via the `voice_configs` lookup — there is exactly one active voice per audience mode, so the voice identifies the audience implicitly.
- `narration_audio.narrator_slug` is the voice-id column. Rename to `voice_id` is coordinated work and not committed; until then, every reader/writer uses `narrator_slug`.
- (Cleanup of `trips.narrator_id` / `user_narrator_id` deferred — see migration backlog. Per drift catalog 5.19a, `narrators` and `user_narrators` are NOT retired.)

**Mirror note:** This section is duplicated in two places that need to stay aligned: (1) `docs/SKILL.md` (committed under `docs/` as of commit `213e905`, 2026-05-14) and (2) the SKILL.md artefact inside the claude.ai project folder, which the chat-side Claude reads. When this section changes, update CLAUDE.md, edit `docs/SKILL.md` to match, and have claude.ai swap in the new artefact. Flag the required claude.ai-side mirror update in the PR description.

## Screen pages (primary flow)

User mental model / naming convention used in conversation:
- **Page 1 — Home:** `app/index.tsx` — route search, map
- **Page 2 — Configuration:** `app/customize.tsx` — narrator + filters
- **Page 3 — Trip:** `app/drive.tsx` — active driving/hiking screen

## Key files

| File | Purpose |
|------|---------|
| `app/index.tsx` | Map screen — route search, POI display. Sheet starts at `peek`, auto-snaps to 85% when routes load. No trail mode state here — always fetches in `'driving'` mode. **Field Notes Layer 1 migrated 2026-05-12 (commit `a965214`):** consumes `useTheme()` from `src/design/theme`; StyleSheet lifted into `useMemo` inside MapScreen with `[theme]` dep; `badgeStyle` helper inlined as a `useCallback` closure; zero `C.*` hits. Three brand-mark color literals (`#2EC4B6`, `#1a1208`) deferred for Layer 2 Wordmark swap (drift 5.44). |
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
| `components/MapStylePicker.tsx` | Floating map style picker (drift 5.98). Trigger = cream pill + Layers SVG + `MAP` mono label; panel = theme-aware paper with Fraunces-italic row names + mono uppercase descriptor sublabels + ink-red active dot. No thumbnails. Prop signature retained verbatim — `mapboxToken` / `trailMode` / `onTrailToggle` accepted but inert. |
| `components/XRoadLogo.tsx` | Legacy brand wordmark — teal "X" + cream "Road" + road-intersection icon. **Unused after drift 5.92** (all six call sites migrated to `<Wordmark size="m" />` or `<Wordmark size="m" background="pill" />`). Kept on disk pending explicit delete. |
| `src/components/Wordmark.tsx` | Canonical brand wordmark. Reads "XRoad" (cap X + cap R, italic "oad") with bicolor X (`accent` ink-red) + Road (`ink`/`paper`). Sizes m/l/xl with proportional 4-hump horizon SVG. `background="pill"` variant adds a cream paper backing (light-theme constants, e2 shadow) for map-overlay screens. |
| `src/components/ModePillRow.tsx` | Drive ↔ Hike-or-Walk selector (drift 5.93). Cream chip with ink-red active fill; car / mountain / walker SVG icons; underlying state stays `'driving'` / `'hiking'` (visible Hike label reads "Hike / Walk"). |
| `src/components/CategoryChip.tsx` | Single category-filter chip primitive (drift 5.95). Active = ink-red fill + cream text; inactive = paperDeep (taupe) fill + ink border + ink text. Fraunces italic 14px. No shadow. |
| `src/components/PoiMarkerX.tsx` | X-shaped POI marker visual (drift 5.94). 32×32 invisible hitbox wrapper around ink-red X glyph. Sizes `curated` (18px stroke 2.5) and `reveal` (12px stroke 1.8). Exports `usePoiMarkerTracking()` for the tracksViewChanges discipline. **Must be the child of a `<Marker>` inlined directly under `<ClusteredMapView>`** — see chip-family section's clusterer integration rule. |
| `src/components/PoiCallout.tsx` | Floating POI callout overlay (drift 5.97). Sibling of MapView (NOT a child Marker). Anchored via `pointForCoordinate`; sticky selection (tap-same toggles, pan repositions). |
| `src/components/CoordinatesPill.tsx` | Floating coords readout above dropped pin (drift 5.99). Mono uppercase coord text + optional Fraunces-italic sublabel (geocoded address on web). |
| `src/design/tokens.ts` | Field Notes design tokens — sole source of color / type / spacing / radius / elevation. No hardcoded hex anywhere else in `src/`. |
| `src/design/theme.ts` | `lightTheme` / `darkTheme` + `ThemeProvider` + `useTheme()`. AsyncStorage key `xroad.colorScheme`. Wrap the app root before `NavigationContainer`. |
| `src/design/fonts.ts` | `useAppFonts()` → `useFonts(FONT_MAP)` over `@expo-google-fonts/{fraunces,inter-tight,jetbrains-mono}`. App.tsx fail-fast gates the navigator until fonts resolve. |
| `src/design/DesignSystemScreen.tsx` | Demo screen at route `design-system` — every swatch + type variant, light + dark side-by-side. |
| `src/components/index.ts` | Barrel for the Field Notes component library (12 primitives + 2 demo screens). |
| `src/components/ComponentsDemoScreen.tsx` | Demo screen at route `components-demo` — every component variant, light + dark. |
| `server/` | Node.js + Express + Socket.io on :3001 |

## drive.tsx UI details

> **Mostly SUPERSEDED by the Pine rebuild (commit `880b807` + subsequent polish).** Drive is now: emerald polyline, cobalt user-location dot with `useUserHalo` pulse, PersonaPill + StoriesBadge top chrome, 3-column TripStat card, retracted/deployed sheet states with breathing watermark X, media controls, Up next, LabeledSlider corridor, ModePillRow, Quiet pill + danger End trip. The legacy details below (sheet snap points, slider styling, "🚗 Driving" emoji segment, etc.) describe the pre-Pine state and should be ignored for current work.

- **Back button** — top-left map overlay, inside `overlayTL` row before the narrator avatar chip. Circular dark button `←`. Shows confirmation alert before navigating back to customize.
- **Sheet snap points** — two states only: `peek` (96px) and `expanded` (82% screen height). `default === expanded` so the hook naturally collapses to two snaps. Sheet starts expanded.
- **Peek state** — shows only: play/pause + skip forward + End Trip. Everything else hidden, map visible above.
- **Expanded state** — single ScrollView containing: now-playing card, feedback/rating card, ⏮/▶/⏭ controls, up next queue (5 items, sorted by arc-length along route), story corridor slider. Below the scroll (pinned): trip-mode segment + action row.
- **Story corridor slider** — `PoiSlider` component (same as customize.tsx) in the expanded sheet. State: `poiDist` initialized from `filters.corridorMi`. Changes trigger POI re-fetch.
- **Up next queue** — sorted by `arcLengthAlongRoute()` (projected arc-distance from route start). Display distance (`distanceMi`) comes from `liveQueue` — haversine from user's GPS position once available, arc-length from route start before GPS is acquired.
- **Top-right counter** — shows `pois.length` (total POIs loaded along route), falling back to `routePreview.storyCount` before POIs load. Label is "stories" / "story".
- **Distance field trap** — `get_corridor_pois` RPC returns `dist_from_route_m` (perpendicular distance to route line), NOT `distance_m`. Never sort or display distances using `p.distance_m` from corridor queries — it will always be `undefined`. Use `arcLengthAlongRoute()` for sequential ordering and `haversineM()` from user position for live display.
- **Trip-mode segmented control** — `[🚗 Driving | 🥾 Hiking]` pinned above action row, outside the ScrollView. Active side fills with `ACCENT_LIGHT`. Toggling hiking re-fetches POIs in `'hiking'` mode and auto-switches map to Topo. Switching back restores the previous map style (`prevStyleRef`).
- **Recenter button** — `CompassIcon` component (teal north triangle + muted south triangle + "N" label). Positioned at `bottom: DRIVE_SNAPS.peek + 64` (above the MapStylePicker pill at `+16`) to avoid overlap.
- **MapStylePicker** — `buttonBottom: DRIVE_SNAPS.peek + 16`, `buttonRight: 12`.
- **POI callout card** — tapping any POI marker shows a floating overlay card at `bottom: DRIVE_SNAPS.peek + 20`. Displays POI name, category (teal uppercase), and tags as chips (underscores → spaces, up to 5). Tapping the same marker again or pressing `×` dismisses it. State: `selectedPoi: POI | null`. **Inactive POI markers render via `<PoiMarkerX size="curated" />`** (drift 5.94) inside a `DrivePoiMarker` wrapper that uses `usePoiMarkerTracking()` (start true → flip false at 1s); active = now-narrating POI keeps the legacy halo + inner-dot visual as a distinct now-playing signifier. Drive uses plain `MapView` (no clusterer) so the wrapper-component pattern is safe here — the clusterer's `isMarker` traversal that bit home does NOT apply on drive.

## customize.tsx UI details

> **Mostly REBUILT in commit `b681329` (2026-05-15).** The page is now top-to-bottom: full-width paperSoft header card (Pine pattern, mirrors home) → 200px non-interactive map peek → ScrollView with curation controls → sticky Start Trip CTA. See the **Pine screens** table at the top of this file for the canonical structure.

- **Header card** — direct child of root View, paperSoft surface, paperEdge hairline, top corners squared / bottom corners radius 26, `paddingTop: STATUS_TOP` so the card itself carries the status-bar inset. Three rows separated by `gap: 12`:
  - **Row 1 (nav)**: 40px circular back button (`backBtn` style with paperSoft fill + paperEdge border + shadow, `navigation.goBack()`) + `<Wordmark size="m" />` center + 40px spacer slot for MapStylePicker.
  - **Row 2 (Strip A)**: route-summary inline `<Text numberOfLines={1}>` mixing four spans — origin (meta inkSoft) + `→` (meta primary) + destination (label ink) + `·` (meta inkFaint) + duration (meta inkSoft). Duration is reactive to hiking toggle via `tripDurationMin`.
  - **Row 3 (Strip B)**: 4-col `<TripStat>` row with hairline top/bottom borders — DISTANCE / DURATION / POIS / PACE. POIS is `curatedCount` (post-filter, post-curation, live-bound to slider/chip changes). PACE is `avgPaceMinutes` (e.g. `1 / 7m`). Both update as the user adjusts filters in the ScrollView below.
- **MapStylePicker** — rendered as the **LAST child of the root View** (after Start Trip CTA), with `buttonTop={STATUS_TOP + 6}` + `buttonRight={12}`. Visually lands in the header card's Row 1 right slot; structurally a sibling at root level so its tap-outside-to-dismiss `absoluteFillObject` overlay covers the full screen and its dropdown panel's paint order beats the map peek + ScrollView region it extends into geometrically.
- **Map peek** — 200px (`MAP_PREVIEW_H`), non-interactive (`scrollEnabled/zoomEnabled/rotateEnabled/pitchEnabled={false}`), shows Polyline + destination Marker only. `<LinearGradient>` bottom-fade `transparent → paper` blends into the ScrollView. **`<MapView key={mapStyleId} ...>`** (commit `128fe0f`) — required so Android's RN bridge clears `customMapStyle` when switching from dark to a style with `customMapStyle: undefined`. Without the key, the previous WARM_DARK_MAP styling persists.
- **Map style persistence** — `lib/mapStyle.ts`'s `loadMapStyle()` / `saveMapStyle()` now persist to AsyncStorage on native (commit `a10cee5`). `STORAGE_KEY = 'rs_map_style'`. Initial state still hardcodes `'dark'` in each consumer's `useState<MapStyleId>('dark')`; persistence overrides via the post-mount `loadMapStyle().then(setMapStyleId)` effect.
- **MapStylePicker dropdown rows** — each option now carries a 40×40 SVG swatch on the left (commit `2c35393`, reverses drift 5.98). Wrapper: rounded 8px square with paperEdge hairline border + per-style background fill (paper / paperWarm / `#2a2a2a` / `#3d4a2c`). Overlay: inline `<Path>` strokes hinting at style character (warm horizon line / street grid / diagonal aerial tiles / topo contour arcs). Helper `StyleSwatch({ id, theme })` + `styleSwatchBg(id, colors)` live in `components/MapStylePicker.tsx`. No Mapbox network calls; `buildThumbUrl` + `mapboxToken` prop remain inert.
- **Categories chip rail** — still in customize (this page is now the sole UI for category selection app-wide; home's chip rail was removed in `05c0b39`). `<CategoryChip>` row with horizontal scroll + edge fade gradients. State sources `selectedCategories` from the Zustand store (also consumed by home's RPC chain).
- **Filter wiring** — see [docs/customize-audit-2026-05-14.md](docs/customize-audit-2026-05-14.md) if extracted. Empty `selectedCategories` array becomes `null` before reaching the RPC (`slugs.length ? slugs : null`), so deselecting all chips = no filter (returns everything). `minRelevance` slider drives both server-side `min_significance` and a client-side re-filter inside `curateRoutePOIs()`.

## Design system — Field Notes (Phase 1, landed 2026-05-12 in commit `98d8243`)

> **SUPERSEDED by Pine — see "Pine redesign — current direction" at the top of this file.** This section is retained as historical context (the tokens, components, demo screens, and drift entries 5.39–5.45 it documents were rebuilt against the Pine palette in commit `880b807`). Do not reference for current design decisions.

Editorial / NatGeo-travel-journal aesthetic. The new system lives entirely under `src/`. Existing screens stay on the legacy `lib/theme.ts` `C` palette until migrated screen-by-screen.

### Structure

```
src/
  design/
    tokens.ts                 Sole source of color / type / spacing / radius / elevation.
                              Light + dark palettes; type ramp (display → metaSmall
                              + button + buttonStrong); 4px spacing; radii s/m/l/xl/pill;
                              elevation e1/e2; glassTint + glassTintInverse overlay colors.
    theme.ts                  lightTheme + darkTheme + ThemeProvider + useTheme().
                              AsyncStorage key `xroad.colorScheme` persists user override
                              (light | dark | system). Wrap before NavigationContainer.
    fonts.ts                  useAppFonts() over @expo-google-fonts/{fraunces,
                              inter-tight,jetbrains-mono}. FONT_MAP keys match
                              the family-name strings in tokens.ts.fontFamilies.
    DesignSystemScreen.tsx    Demo at route `design-system` — every color swatch,
                              every type variant, light + dark side-by-side.
  components/
    Wordmark, Kicker, Card, SegmentedControl, PrimaryButton, DangerButton,
    AudienceMark, GlassPill, OfflineBadge, NarrationCard, Waveform, FieldNotesDivider
    index.ts                  Barrel export.
    ComponentsDemoScreen.tsx  Demo at route `components-demo` — every component,
                              every variant, light + dark side-by-side.
```

### Hard rules

- **No hardcoded hex anywhere in `src/` outside `src/design/tokens.ts`.** Verify with `grep -rn '#[0-9a-fA-F]{3,8}' src/` — all hits must land in tokens.ts (12 palette entries + 2 elevation shadow literals).
- **No inline `fontFamily` / `fontSize` literals outside `theme.textVariants`.** One documented exception: `src/components/Wordmark.tsx` uses inline `fontFamily` + `fontSize` for the brand-mark cap height (24 / 40 / 56), called out in `src/components/index.ts`'s header comment.
- **All new components consume tokens via `useTheme()`.** No prop-drilled colors. Per-color overrides live on the variant prop (`<Card variant="ink">`), not as raw hex.
- **Type-ramp variants are atomic.** Don't override `fontWeight` / `fontStyle` inline on a variant — add a new variant if the existing ramp doesn't cover the case. Precedent: Phase 1 added `button` + `buttonStrong` (both Fraunces italic 16/1.3, weights 500 / 600) precisely so PrimaryButton / DangerButton / NarrationCard didn't need inline italic overrides on `h3`.
- **`AudienceMark`, not `NarratorMark`.** The repo aligns to the `voice_configs.mode` audience taxonomy (family / kids / unfiltered / local), not the spec's narrator taxonomy (professor / local / kid / trucker). Both glyph sets shared; only naming differs. See drift catalog 5.39 — `NarratorMark` deferred to the Prompt 10 narrator-picker arc.

### Demo screen entry points

Two `__DEV__`-gated buttons sit at the top-right of `app/index.tsx`'s mobile layout:
- `[DS]` → `navigation.navigate('design-system')`
- `[CD]` → `navigation.navigate('components-demo')`

Render only when `__DEV__ && !isDesktop`. Production builds elide them.

Implementation lives at [app/index.tsx](app/index.tsx#L1115) inside the `<SafeAreaView style={s.topSafe} pointerEvents="box-none">` block. Styled via `s.devNavRow` (absolute top:4 right:20, zIndex 100) and `s.devNavLabel` (legacy `Platform.select` monospace 16pt — these two dev-only buttons are deliberately NOT migrated to the new design system; only their color migrated to `theme.colors.inkSoft`). Each `TouchableOpacity` also carries inline `paddingHorizontal: 8 / paddingVertical: 4` for a reliable tap target (Phase-1 visual-verification fix, commit `1d40cb7`).

**`pointerEvents` posture on `SafeAreaView`:** must be a top-level prop, not inside the `style` array. The library (`react-native-safe-area-context` 5.6.2) accepts both forms in newer RN, but only the top-level form works reliably for `box-none`. See drift catalog 5.42 for two remaining in-style hits in the same file — post-Layer-1 line numbers are 869 (`s.desktopPillWrap` StyleSheet entry, with `as any` cast; consumer at 1317 redundantly passes a top-level prop) and 1165 (chip-row `<ScrollView style={{ pointerEvents: 'box-none' } as any}>` — actually-buggy: ScrollView absorbs taps).

## Field Notes brand chip family + map integration (drifts 5.92 – 5.99, landed 2026-05-13/14)

> **SUPERSEDED by Pine.** The cream-chip-on-map family described below (Wordmark pill, ModePillRow, PoiCallout, CoordinatesPill, MapStylePicker trigger, ClusterMarker) was reworked under Pine — single dark theme + near-black surfaces + emerald accents + pin-shaped clusters. The current state of each component is documented in the "Pine redesign — current direction" section at the top. This section retained as historical context for the drift catalog entries it references.

### Branded chip family — shared posture

Six surfaces compose the "cream chip on map" family. All share the same
discipline:

- **Colors locked to `lightTheme.colors.*` constants** (NOT `theme.colors.*`)
  so the chip stays cream-on-map regardless of system scheme. Import
  `lightTheme` from `src/design/theme` alongside `useTheme` when both are
  needed. Active fills that should track the scheme (ink-red light vs dark
  variant) use `theme.colors.accent` — only the chip *background* is locked.
- **`e2` drop shadow, Platform-split**: iOS pulls `lightTheme.elevation.e2`;
  Android uses `elevation: 4` (the token's 8 over-darkens chip-sized
  surfaces). Extract `PILL_SHADOW` as a module-scope const when reused.
- **`borderRadius: 999`** for the canonical pill shape.
- **No `useTheme()` for fonts** — `fontFamilies` are identical across
  both schemes, so `lightTheme.fontFamilies.*` resolves the same value as
  `theme.fontFamilies.*` but signals "constant" semantically.

Surfaces:
| Component | Drift | Pattern |
|---|---|---|
| `<Wordmark background="pill">` | 5.92 | cream pill, bicolor `X` (accent) + `Road` (ink) |
| `<ModePillRow>` | 5.93 | two equal-flex pills, ink-red active fill |
| `<PoiCallout>` | 5.97 | floating above tapped X marker, mono coords + optional sublabel |
| `<CoordinatesPill>` | 5.99 | floating above dropped pin, mono uppercase coord readout |
| `MapStylePicker` trigger | 5.98 | layers icon + `MAP` mono label |
| `ClusterMarker` bubble | 5.94 polish | circular paper-cream count on accent fill |

**One exception — interactive picker panel** (MapStylePicker's expanded
panel, not its trigger): theme-aware paper surface that flips dark in
dark mode. Triggers are chips; expanded panels are interactive UI.

### Wordmark variants (drift 5.92, [src/components/Wordmark.tsx](src/components/Wordmark.tsx))

- Reads **"XRoad"** (capital X + capital R; "oad" lowercase italic).
  Bicolor: `X` is `accent` (ink-red), `Road` is `ink` (or `paper` for
  `tone="paper"`).
- Sizes `m` / `l` / `xl` → cap heights 22 / 32 / 56px with proportional
  horizon SVG (4-hump wave, viewBox W×12, baseline y=6).
- `background="pill"` variant adds the cream paper-pill backing with
  locked light-theme constants — used on map-overlay screens (home,
  hiking). Paper screens (customize, drive, trail, filters) use
  `background="none"` (default).

### Mode pill (drift 5.93, [src/components/ModePillRow.tsx](src/components/ModePillRow.tsx))

- Drive | Hike-or-Walk selector. **Visible** Hike label reads `Hike /
  Walk`; **underlying state** stays `'driving' | 'hiking'`
  (`TripMode` in [src/store/tripStore.ts](src/store/tripStore.ts)).
- Inline-SVG icons: car (Drive, left only), mountain + walker (Hike,
  flanking the label). Stroke 1.8, linecap/join round, color inherits
  from text color.
- Active = `lightTheme.colors.accent` fill + cream label/icons.
  Inactive = `lightTheme.colors.paper` fill + 1px ink border + ink
  label/icons. Both pills carry `PILL_SHADOW`.
- Sole consumer: home screen (`app/index.tsx`). Customize doesn't render
  it today but the component is shaped to accept future re-use.

### Category filter chips (drift 5.95, [src/components/CategoryChip.tsx](src/components/CategoryChip.tsx))

- Single-chip primitive `<CategoryChip label active onToggle>`.
- **Active**: `theme.colors.accent` (theme-aware ink-red) fill +
  `lightTheme.colors.paper` text. **Inactive**: `theme.colors.paperDeep`
  (taupe) fill + 1px ink border + ink text.
- Fraunces italic 14px, weight 600 active / 500 inactive.
- No shadow (chips live on paper surfaces, not over the map). No
  margins — caller's row supplies the gap.
- Consumed by customize CATEGORIES section and home chip rows (mobile +
  desktop). Existing horizontal ScrollView row layout + fade gradients
  preserved — drift 5.95 was visual treatment only.

### POI marker + clusterer integration (drift 5.94 — multi-commit)

**Visual primitive:** [src/components/PoiMarkerX.tsx](src/components/PoiMarkerX.tsx).
Ink-red X glyph centered inside a 32×32 invisible wrapper for a
comfortable hitbox. `curated` = 18px stroke 2.5; `reveal` = 12px stroke
1.8. Color locked to `lightTheme.colors.accent`. **This is the visual
ONLY** — NOT a Marker, must be the child of a Marker rendered in the
parent screen.

**Critical clusterer rule (drift 5.94 root-cause):**
react-native-map-clustering's [helpers.js:6](node_modules/react-native-map-clustering/lib/helpers.js#L6)
`isMarker(child)` reads `child.props.coordinate` *directly on the JSX
element passed to `<ClusteredMapView>`*. **Function-component wrappers
around `<Marker>` hide the `coordinate` prop** from
`React.Children.toArray(children)` and the clusterer silently drops
them; React still renders them as plain Markers but they never
aggregate. **POI markers MUST be inlined** as `<Marker>` elements
directly under `<ClusteredMapView>`; `<PoiMarkerX>` is the child of
each. A single screen-scoped `initialTracking` state drives
`tracksViewChanges` for all POI markers at once — one timer, not
per-marker hooks (which would require wrapper components and
re-introduce the bug).

`usePoiMarkerTracking()` is still exported from `PoiMarkerX.tsx` for
**drive** — drive uses plain `MapView` (no clusterer), so its
`DrivePoiMarker` wrapper is safe.

**ClusteredMapView props on home:**
- `clusteringEnabled` (unconditional true — clustering is standard map
  behavior in both browse and post-route modes)
- `minPoints={5}` (1–4 markers stay individual; 5+ aggregate)
- `radius={80}` (bumped from library default 60; more aggressive
  condensing at low zoom, still resolves to individuals at high zoom)
- `renderCluster={renderCluster}` (custom bubble renderer)

**Singleton markers** (destination, manual origin, stop dots, pending
pin) carry `{...({ cluster: false } as any)}` to opt out of clustering.
With `clusteringEnabled` now unconditional, these flags are
load-bearing in both modes.

**Cluster bubble visual (drift 5.94 polish):**
- Size steps 40 / 48 / 56 (thresholds at 50 / 500 counts).
- Count text: JetBrains Mono 600 14px paper-cream. Italic serif looks
  off-center in tight circles; tabular mono digits align cleanly.
- Android centering: `includeFontPadding: false` +
  `textAlignVertical: 'center'`.
- Drop shadow + no border — separates adjacent bubbles against dense
  map content.

### POI callout overlay (drift 5.97 + follow-up, [src/components/PoiCallout.tsx](src/components/PoiCallout.tsx))

**Architecture:** `<PoiCallout>` is rendered as a **sibling of
`<ClusteredMapView>`**, not as a child Marker or built-in `<Callout>`.
react-native-map-clustering 4.0.0 silently drops the built-in Callout
tap flow even with explicit `markerRef.current?.showCallout?.()` (the
e038f43 workaround did not take); home abandons it entirely.

**Behavior (sticky selection):**
- Tap an X → callout shows above the pin. Parent resolves screen
  position via `mapRef.current.pointForCoordinate(...)`.
- Tap the **same** X again → callout dismisses (reason `'tap-same'`).
- Tap a **different** X → callout switches POI.
- Tap the map background → does **NOT** dismiss (sticky).
- Pan / zoom → callout **repositions** to stay glued to its POI
  (re-resolved screen position in `onRegionChangeComplete`).

**Diagnostic logs (still in place pending hardware verification):**
- `[home] marker:tap { poi, id, screen }`
- `[home] callout:show { poi, screen, screenPos }`
- `[home] callout:dismiss { reason: 'tap-same' | 'unmount', poi }`

**Drive's `selectedPoi` overlay** is a separate, richer overlay
(category + tag chips) in `app/drive.tsx`. Untouched by drift 5.97;
shared-primitive consolidation deferred (5.73 follow-up arc).

### Pin-drop coordinates pill (drift 5.99, [src/components/CoordinatesPill.tsx](src/components/CoordinatesPill.tsx))

When user taps the map to drop a stop candidate:
- `<CoordinatesPill>` renders above the pin (sibling of MapView,
  anchored via `pointForCoordinate`). Primary text: JetBrains Mono 11px
  uppercase, formatted `35.564°N · 121.094°W` via local `formatCoord`
  helper (picks hemisphere from sign).
- Optional sublabel: Fraunces italic 12px. On web, carries the
  geocoded address. On native, suppressed when `pendingPinName` is raw
  coords (regex `/^-?\d/` on leading char — geocoded addresses start
  with a letter; raw coords start with a digit or minus).
- Repositions on `onRegionChangeComplete` alongside the POI callout.
- The **bottom pin-drop action row** is now compact: `[📍 Add stop]
  [✕]` (style `s.pendingPinActionRow`). The address-text slot was
  removed since coords live in the floating pill. The stop-remove
  callout (`s.pendingPinCallout` for `pressedStopIdx`) is **untouched**
  — different flow.

### Map style picker (drift 5.98, [components/MapStylePicker.tsx](components/MapStylePicker.tsx))

- **Trigger**: cream pill (light-theme constants) + 18px Layers SVG icon
  + `MAP` mono label.
- **Panel**: theme-aware paper (flips dark in dark mode) + `MAP STYLE`
  mono kicker + 1px rule divider + vertical row list.
- **Each row**: Fraunces italic 500 17px name + mono uppercase
  descriptor sublabel + 8px ink-red active dot on the right.
- **Display mapping** (in-file `STYLE_DISPLAY` const; `MAP_STYLES`
  catalog in `lib/mapStyle.ts` + `MapStyleId` enum untouched):
  - `standard` → `Default / STREETS`
  - `dark` → `Dark / NIGHT MODE`
  - `satellite` → `Satellite / AERIAL`
  - `topo` → `Outdoors / TERRAIN`
- **Prop signature retained verbatim** for backward compat —
  `mapboxToken`, `trailMode`, `onTrailToggle` accepted but inert. Mapbox
  thumbnails removed.

### Filter wiring chain (drift 5.96)

Customize screen filter chain (chip toggle / density / relevance → POI
count). Wiring was already structurally correct on inspection; three
real-world failures patched:

1. **Silent RPC errors** — both `countPOIsAlongRoute` and
   `getPOIsAlongRoute` `.then` chains were missing `.catch`. Now emit
   `[customize] filter:rpc-error { fn, err }`.
2. **Race condition** — rapidly toggling chips could let a slow earlier
   RPC overwrite a fresh response. New `filterRequestVersion` ref in
   [app/customize.tsx](app/customize.tsx); each effect captures its
   version, `.then` callbacks bail on mismatch.
3. **`countPOIsAlongRoute` didn't forward `min_significance`** — so the
   header live-story count didn't track the relevance slider. Added
   optional `options.minSignificance` argument in
   [lib/supabase.ts](lib/supabase.ts), wired from customize.

**Diagnostic chain logs (`__DEV__` only, still in place):**
- `[customize] filter:chip-toggle { id, nextActive, allActive }`
- `[customize] filter:slider-change { which: 'density' | 'relevance' | 'poiDist', value }`
- `[customize] filter:rpc-call { corridorMi, mode, categories, minSignificance, density, version }`
- `[customize] filter:rpc-return { fn, count, sample?, version }`
- `[customize] filter:rpc-error { fn, err }`
- `[customize] filter:stats-render { count, avgPaceMin }`

Existing `curation:top10` / `bottom5` / `stats` logs preserved alongside.

### Phase 1 Design-system decisions logged in drift catalog

- **5.39** (`noted`): `AudienceMark` over Prompt 03's `NarratorMark`. Audience-taxonomy alignment with `voice_configs.mode`. `NarratorMark` deferred to Prompt 10.
- **5.40** (`noted`): PrimaryButton sublabel uses `metaSmall` (mono 9px) rather than spec's 8px. 9px is the smallest in the canonical ramp; 8px deemed below readability threshold.
- **5.41** (`open`): repo-wide `npx tsc --noEmit` has 29 pre-existing type errors across 5 files / subprojects (admin/, app/drive.tsx:335, lib/__tests__/routeBadges.test.ts, scripts/poi-import/lib/category-map.ts:27, scripts/precache-popular-routes.ts:434). Deferred to a dedicated cleanup arc — does not block Phase 1. Phase 1's own files (App.tsx, app/index.tsx, src/**) have **zero** tsc errors.
- **5.42** (`open`): two remaining `pointerEvents` in-style hits in `app/index.tsx` (post-Layer-1 lines 869 and 1165). Cleanup deferred. Filed in commit `bf3617f`.
- **5.43** (`resolved`): Fraunces descender clipping on `display` / `h1` variants — line-height multipliers loosened (display 1.0→1.15, h1 1.05→1.19) in commit `1d40cb7`.
- **5.44** (`open`): three brand-mark color literals (`#2EC4B6` ×2, `#1a1208`) remain in `app/index.tsx`'s **desktop sidebar** StyleSheet (`logoX` / `logoPinOuter` / `logoPinInner` / `brandX` entries at lines 1029/1039/1043/1045, consumed by the desktop top-bar block ~line 1771). Mobile path was already migrated to `<Wordmark size="m" background="pill" />` via drift 5.92. Desktop sidebar swap deferred — separate code path, separate visual context.
- **5.45** (`open`): three color-distinction collapses from the 15-token → 9-token mapping (GPS-vs-manual origin dot, hot-color hue family, border-vs-elevation). Address in Layer 2 with non-color signals. Filed in commit `a965214`.

## Supabase schema (key tables)

- `pois` — geography(Point,4326), category_id FK, tags[], significance_score numeric(4,2) **0-100 integer-point scale** (importers write 0-1 fractions; recompute-significance.ts normalises to 0-100), trip_mode('driving'|'hiking'|'city'|'all'). Provenance columns (added 20260504000005): source_type CHECK ∈ {osm,wikidata,nrhp,state_landmark,gnis,narrative_extracted,editorial,user_contributed}, source_id, source_citation, confidence_score(0–1, default 1.0), verified bool, additional_sources text[], merged_into uuid (self-FK, set when row is a merged duplicate), imported_at. Partial UNIQUE(source_type, source_id) WHERE merged_into IS NULL. `significance_breakdown jsonb` (added 20260504000006): `{ source_base, cross_source, pageviews, route_adjacency, total }` in integer points — populated by recompute-significance.ts. `narration_cache jsonb` (added 20260504000014; populated by server after generation): `{ "{trip_mode}-{depth}-{narrator_slug}": "{audio_url}" }` — O(1) lookup on the same row as the POI, checked before the narration_audio table. Venue columns (added 20260504000016): `parent_poi_id uuid` (self-FK to parent venue), `is_venue bool`, `venue_polygon geography(Polygon, 4326)`, `venue_type text` (14-value CHECK enum), `venue_metadata jsonb`. Cross-column constraints prevent venue/child overlap. Trigger-shape columns: `poi_type text NOT NULL DEFAULT 'point'` CHECK `('point','area','viewpoint')` (added 20260511000001) — 99.9% of rows are `'point'`; `area` and `viewpoint` are reserved for non-point geometries with custom trigger semantics. `visibility_radius_miles numeric NOT NULL DEFAULT 1.0` — per-POI override of the default proximity-trigger radius; read by `usePOIStream` and the corridor RPC.
- `poi_categories` — id, slug, display_name, sort_order, relevant_driving bool
- `narrators` — preset narrator rows; 4 seeded with fixed UUIDs `00000000-0000-0000-0000-00000000000{1-4}`
- `user_narrators` — user-created narrators; slug GENERATED as `'user-' || id`
- `trips` — `id` uuid PK, `user_id` uuid FK→`auth.users` ON DELETE SET NULL, `route_name` text, `origin` text, `destination` text, `distance_mi` double, `duration_min` int, `narrator_id` uuid FK→`narrators` ON DELETE SET NULL, `user_narrator_id` uuid FK→`user_narrators` ON DELETE SET NULL, `narrator_name` text, `depth` text NOT NULL DEFAULT `'ride_along'` CHECK (`'glance'|'ride_along'|'deep_dive'`), `category_filter` text[] NOT NULL DEFAULT `'{}'`, `poi_distance_m` int NOT NULL DEFAULT 500, `status` text NOT NULL DEFAULT `'pending'` CHECK (`'pending'|'active'|'completed'|'abandoned'`), `started_at` timestamptz, `completed_at` timestamptz, `created_at` timestamptz NOT NULL DEFAULT `now()`. Indexes: `trips_user_id_idx`, `trips_status_idx`. No `mode` column (audience/trip-mode separation lives in code request params per the Dimensional model). Reconciled with live DB 2026-05-11.
- `narration_audio` — poi_id, narrator_slug (= voice_id), depth, audio_url (nullable — NULL while pending), mode, status CHECK('pending','ready','failed') DEFAULT 'ready'. UNIQUE(poi_id, narrator_slug, depth, mode) — widened from the original 3-column shape by migration 20260510000005 (Prompt 07). 30-day TTL. Added columns (migration 20260504000011): provider, character_count, duration_ms, cost_usd, prompt_version. Added (migration 20260504000013): status, mode, audio_url made nullable.
- `user_contributions`, `user_badges`, `contribution_rewards` — contribution/points system
- `user_recent_locations` — **PENDING MIGRATION** (SQL is in lib/supabase.ts as a comment)
- `venue_classification_review` (added 20260504000016) — admin queue for venue candidates without polygons

Key RPCs: `get_corridor_pois`, `get_nearby_pois(... , p_include_children boolean DEFAULT false)` (patched 20260504000016 — children excluded by default for drive-by), `get_available_narrators`, `submit_contribution`, `get_cached_narration`, `cache_narration`, `batch_route_adjacency_scores(poi_ids uuid[])` (returns per-POI adjacency points from `highway_routes`), `batch_update_significance(p_ids, p_scores, p_breakdowns)` (batch UPDATE used by recompute script), `update_poi_narration_cache(p_poi_id, p_cache_key, p_audio_url)` (added 20260504000014 — atomic jsonb merge used by narration generation route), `get_venue_tour_pois(p_parent_poi_id, p_user_lat?, p_user_lon?)` (added 20260504000016), `detect_venue_at_location(p_lat, p_lon)` (added 20260504000016 — innermost venue at coordinate)

## Narration cache key

Always: `{poi_id}-{trip_mode}-{depth}-{narrator_slug}.opus` (Storage path) / `{trip_mode}-{depth}-{narrator_slug}` (JSON key in pois.narration_cache)

## hooks/useTTS.ts — architecture (rewritten this session)

**Options:** `{ mode: NarrationMode, depth: NarrationDepth }` — no longer takes `voice`, `guideName`, or `tone`.

**Lookup chain (fastest → authoritative):**
1. `poi.narration_cache["{trip_mode}-{depth}-{narrator_slug}"]` — O(1) if POI row includes this field
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
4. Upload Opus to Storage at `{poi_id}/{trip_mode}/{depth}/{narrator_slug}.opus`
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
`server/routes/narration.js` calls a generic ~10-line inline prompt at `generateNarrationText()` ([narration.js:66-114](server/routes/narration.js#L66-L114)). No narrator persona, no `audience_mode` awareness. Same for `scripts/precache-popular-routes.ts` ([precache-popular-routes.ts:103-138](scripts/precache-popular-routes.ts#L103-L138)) — duplicated copy of the same prompt. Trip-mode/depth axes affect length (`DEPTH_CFG`) and Storage path only; they do not change tone.

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

Audience guardrails are **all four audience modes seeded and engine-ready** in `narrators.content_guardrails` — Family, Kids ("Strict. No violence, death, or disturbing content"), Unfiltered (18+ age-gate), Local. No tech-debt flag for missing Kids.

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

Legacy `source text DEFAULT 'curated'` column was dropped 2026-05-11 via `20260511000003_pois_source_drop.sql`; provenance is now carried by `source_type` / `source_id` / `source_citation` (added in `20260504000005_poi_source_provenance.sql`). See drift catalog 5.16 for rationale.

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

## Wordmark placement (all screens) — post-drift 5.92

Canonical mark is `<Wordmark size="m" />` (or `background="pill"` on
map-overlay surfaces). Import from `../src/components`. Legacy
`<XRoadLogo>` is unused; all six call sites below were migrated in
commits `6adecc9` and `47103a0`.

| Screen | Variant | Position |
|--------|---------|----------|
| index.tsx | `size="m" background="pill"` | Centered above search pill (mobile SafeAreaView), `s.logoWrap` |
| customize.tsx | `size="m"` (no pill) | Center of map header row (replaces "Customize trip" title text) |
| hiking.tsx | `size="m" background="pill"` | Center of top header bar (over MapView) |
| filters.tsx | `size="m"` (no pill) | Right side of header row (paper SafeAreaView) |
| trail.tsx | `size="m"` wrapped in `<View style={{ opacity: 0.6 }}>` | Centered above bottom button bar |
| drive.tsx | `size="m"` wrapped in `<View style={s.driveLogoWrap}>` | Below drag handle in bottom sheet, opacity 0.5 via wrapper |

## Automation hooks (.claude/settings.json)

- **PreCompact**: injects `additionalContext` telling Claude to update CLAUDE.md before compaction + shows `systemMessage` in UI
- **Stop**: shows `systemMessage` reminder to update CLAUDE.md after each response
- Both use `shell: "powershell"`

## Mobile preview during development

- **Fastest:** `npx expo start --web` → Chrome DevTools → device toolbar → iPhone 14 (390×844). Uses Mapbox shim, layout accurate.
- **Most accurate:** `npx expo start` → scan QR with Expo Go on physical device.
- **Android native:** Android Studio emulator (Pixel 6, 412×915) → `npx expo start --android`.

### Running the dev server from Claude Code (non-interactive shell)

- **Always pass `--port <n>` explicitly.** When 8081 is occupied, `expo start` prompts "Use port 8084 instead?" — in non-interactive mode it errors with `Input is required, but 'npx expo' is in non-interactive mode` and prints `› Skipping dev server`, exit 1. The `npm start` script (`expo start`, no port) is fine in a real terminal but unusable from a background task.
- **No QR code prints** in non-interactive mode — only `Waiting on http://localhost:<port>`. Connect from Expo Go via "Enter URL manually" → `exp://<LAN-ip>:<port>`.
- **Stale Metro bundlers accumulate.** Each abandoned `expo start` keeps its port held until the node process is killed. Check with `netstat -ano | findstr :808` (lists 8081–8089 listeners + PIDs). Kill via Git Bash: `taskkill //PID <pid> //F` — **double-slash** on the flags so MSYS doesn't path-mangle them into `/PID` / `/F`.
- **Stale-bundle gotcha (learned 2026-05-12).** Pressing `r` in Metro reloads JS on the device from whatever bundle Metro is currently serving — it does **not** force a re-bundle. On Windows, Metro's file watcher occasionally misses edits (drive-letter paths, OneDrive sync, antivirus interference). Symptom: source edit is correct on disk but the device behaves as if the change never happened (e.g., a freshly-added `console.log` in a `__DEV__` block never fires). Resolution: kill **all** Metro processes (`taskkill //PID <each-pid> //F`), confirm with `netstat -ano | findstr :808` returning no output, then restart with `--clear` (`npx expo start --port 8081 --clear`) in your interactive terminal so you get the QR + can press `r` from there. Multiple stacked Metro listeners compound this — if `netstat` shows more than one `:808x` listener, the device may be attached to a stale instance.

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
- Partial unique index: `idx_voice_configs_active_mode ON voice_configs(mode) WHERE is_active = true` — one active voice per audience mode at all times
- RLS: service_role only
- Audience modes: family (warm doc narrator), kids (Junior Explorer), unfiltered (Off the Leash deadpan), local (insider neighbor)

### Voice audition tooling

Three tools exist. **Use `audition-voices.ts` for picking voices** (it integrates with the TTS abstraction + voice_configs table). `audition-family-realistic.ts` is a production-shape alternative for Family mode that runs hand-picked Chirp 3 HD voices through real narration paragraphs at two speaking rates and builds a blinded HTML comparison page (`scripts/voice-audition/audition-family-realistic.ts` → `scripts/audition-output/family-realistic/index.html`; idempotent on re-run). `run.ts` is the older HTML-based tool kept for reference.

#### Primary: `scripts/audition-voices.ts`
Single-file CLI run from `scripts/voice-audition/`. Uses `generateNarration()` with `voiceConfigOverride` (no voice_configs table required), logs to `llm_calls`, writes Opus to `scripts/audition-output/{audience_mode}/{voice_id}.opus`.

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

Listen: OGG/Opus — Chrome or Firefox (not Safari). Output: `scripts/audition-output/{audience_mode}/`.

#### Legacy: `scripts/voice-audition/run.ts`
Generates samples + builds `scripts/voice-audition/output/index.html` browser player. Calls Google TTS directly without TTS abstraction.
```
cd scripts/voice-audition
pnpm audition:old    # generate candidates, build HTML
pnpm audition:all    # generate ALL Chirp3-HD + Neural2 voices
pnpm html            # rebuild index.html only
```

### Voice candidate shortlist (Step 3 — user has not yet picked)

3 candidates per audience mode. Default speaking rates: family 1.0, kids 1.1, unfiltered 0.95, local 1.0.

| Audience mode | Candidate voice_id | Reasoning |
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

### Migration conventions

- **Schema-qualified table names.** Use `public.<table>` in `ALTER TABLE` / DDL and `'public.<table>'::regclass` in verification casts. Established practice since `20260510000001_user_preferences_capture.sql`, which emitted DDL from Postgres's own `pg_get_*def` helpers (always schema-qualified). All migrations from 2026-05-10 forward follow this.
- **Pre-2026-05-10 migrations use bare names** (`pois`, not `public.pois`). Applied and frozen; do not retroactively rewrite.
- **Date prefix accuracy.** The `YYYYMMDD` portion of the filename must reflect the actual local-clock day of file creation. Verify against `date +%Y%m%d` before staging. (Precedent: 5.16/5.30/5.35 migrations were originally drafted with `20260512*` prefixes on 2026-05-11 and renamed pre-commit.)
- **File-suffix vocabulary.** Operation-verb-at-end. Running list of suffixes established this session:
  - `_check.sql` — single-column CHECK constraint add (precedent: 5.17 → `20260511000001_pois_poi_type_check.sql`)
  - `_enum_checks.sql` — multiple CHECK constraints on one table in a single atomic migration (precedent: 5.30 → `20260511000002_corridors_enum_checks.sql`)
  - `_drop.sql` — column drop (precedent: 5.16 → `20260511000003_pois_source_drop.sql`)
  - `_comment.sql` — function-level COMMENT (precedent: 5.35 → `20260511000004_get_corridor_pois_comment.sql`)
- **Naming-form patterns.**
  - `<table>_<column>_<verb>.sql` — column-level ops
  - `<table>_<scope>.sql` — table-level multi-column ops (e.g., `scope = enum_checks`)
  - `<function_name>_<verb>.sql` — function-level ops
  - Column-level COMMENT, if ever needed: `<table>_<column>_comment.sql`
- **Destructive-op posture.** DROP statements use default RESTRICT (no CASCADE) so unexpected dependencies fail loudly at migration time rather than silently nuking dependents (precedent: 5.16).
- **Migration body shape.** See recent resolved catalog entries (5.17, 5.30, 5.16, 5.35) for the canonical body: drift-catalog ref + rationale header, inline pre-flight summary, `BEGIN` / `COMMIT` wrapper, trailing verification query.
- **Function-signature changes: drop-loop then bare CREATE, NOT `CREATE OR REPLACE`.** PostgreSQL's `CREATE OR REPLACE FUNCTION` only REPLACEs when the argument list matches **exactly**. If the new signature adds, removes, or reorders params, REPLACE silently CREATEs an additional overload and the old overload stays live. PostgREST then sees both overloads when called by name and returns `PGRST203` — `Could not choose the best candidate function`. Drift catalog 5.90 burned a half-day chasing this.

  Canonical pattern for any migration that touches a function signature:

  ```sql
  BEGIN;

  -- Drop every overload of public.<func> regardless of current signature(s).
  -- pg_proc loop is defensive against unknown / drifted / future overloads
  -- that a static signature inventory might miss.
  DO $$
  DECLARE func_sig text;
  BEGIN
    FOR func_sig IN
      SELECT pg_get_function_identity_arguments(oid)
      FROM pg_proc
      WHERE proname = '<func>'
        AND pronamespace = 'public'::regnamespace
    LOOP
      EXECUTE 'DROP FUNCTION public.<func>(' || func_sig || ')';
    END LOOP;
  END $$;

  CREATE FUNCTION public.<func>(...) ... ;  -- not REPLACE — bare CREATE
                                            -- errors loudly if any overload
                                            -- somehow survived the loop
  GRANT EXECUTE ...;
  COMMENT ON FUNCTION ... ;

  COMMIT;
  ```

  - `BEGIN`/`COMMIT` is mandatory: partial apply (drop succeeds, create fails) must roll back to the prior shape — not zero overloads, which hardens the outage.
  - Use bare `CREATE FUNCTION`, not `CREATE OR REPLACE`. After the loop the function is gone, REPLACE would silently no-op the "would-create" case; CREATE makes the intent explicit and fails loudly if cleanup defensively missed an overload.
  - Precedents: `20260513000001_get_corridor_pois_overload_cleanup.sql` (rescue migration for drift 5.90); `20260512000003_get_nearby_pois_significance.sql` (gets it right on first try — never tripped 5.90 because of the drop loop).
  - Naming when this pattern stands alone as a cleanup: `<function_name>_overload_cleanup.sql` (precedent 5.90 above). When it's the canonical install of a new signature: `<function_name>_<purpose>.sql` is fine — the drop loop is just inside the body.

### Migration backlog status (updated 2026-05-14)

**DB watermark: `20260514000007`** — all migrations through 20260514000007 applied. No migration files currently staged-but-not-applied.
Verification scripts: `scripts/verify-migrations.mjs` (66/66 checks passed on 000014; listed in `.gitignore`). Post-0016 schema verification lives in `scripts/admin/verify-venue-schema.ts`. Phase 2 migrations were applied chunked (pre-snapshot → body → post-snapshot+diff in a `_verify` schema, then `DROP SCHEMA _verify CASCADE`); this catches accidental drift and is the recommended pattern for live-DB migrations going forward. Live schema can be dumped on demand via `node scripts/admin/dump-schema-snapshot.mjs > docs/db-snapshot-YYYY-MM-DD.md`.

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
- 20260504000021 `narration_audio_bucket_codecs_mime` — extends the narration-audio bucket's `allowed_mime_types` to accept `'audio/ogg; codecs=opus'` (the parameterised form returned by the Google TTS wrapper) in addition to bare `'audio/ogg'` / `'audio/opus'`. `storage.buckets.allowed_mime_types` does exact-string matching; without this entry every narration upload errored with "mime type audio/ogg; codecs=opus is not supported", which ate Claude + Google TTS spend silently before the precache could log it. Applier: `scripts/poi-import/apply-narration-bucket-codecs-mime.mjs`. Discovered during the 2026-05-10 LA→Cambria smoke batch — see "Three audit / display quirks" note in the precache section.
- 20260510000001 `user_preferences_capture` — captures the live `user_preferences` table + its `set_updated_at()` trigger function, both of which existed in production but had no migration file (Phase 0 grep across all 26 prior migrations returned zero matches). DDL was emitted via Postgres's own `pg_get_constraintdef` / `pg_get_indexdef` / `pg_get_triggerdef` / `pg_get_functiondef` helpers (`pg_dump` was not on PATH). Idempotent: `CREATE TABLE IF NOT EXISTS` + inline constraints + `CREATE OR REPLACE FUNCTION` + `DROP TRIGGER/POLICY IF EXISTS` + `CREATE`. Verified live via pre/post snapshot diff in a `_verify` schema — zero drift. 9 columns, 4 CHECK constraints (`audience_mode_valid`, `depth_valid`, `cache_budget_sane`, `unfiltered_requires_age`), FK→`auth.users` ON DELETE CASCADE, 3 RLS policies on `auth.uid()`. Note: `set_updated_at()` is generically named but currently has only one user — `user_preferences`.
- 20260510000002 `user_preferences_autocreate` — `handle_new_user_preferences()` SECURITY DEFINER function + `on_auth_user_created_preferences` AFTER INSERT trigger on `auth.users` so future signups get a preferences row automatically (with `ON CONFLICT (user_id) DO NOTHING` for safety). Backfill INSERT for existing `auth.users` was a 0-row no-op (no users registered yet — `auth.users` count = 0). `SECURITY DEFINER` is required because the trigger runs as the inserting user, who has no INSERT privilege on `public.user_preferences` without the elevation.

**Applied 2026-05-11 (corrected from "staged" — see drift catalog 5.32):**
- 20260510000003 `narration_audio_index` — `CREATE INDEX idx_narration_audio_lookup ON narration_audio(poi_id, mode, depth, narrator_slug)`. Composite covers the read-path query "do I have audio for this POI in this trip-mode + depth + voice already?" The existing `na_unique` UNIQUE index (poi_id, narrator_slug, depth) covers write-time uniqueness but not mode-filtered SELECTs. Confirmed live via `pg_indexes`. (Note: na_unique constraint was widened to 4-column on 2026-05-11 — see 20260510000005 entry below.)
- 20260510000004 `llm_calls_index` — three b-tree indexes (`created_at DESC`, `(call_type, created_at DESC)`, `related_id WHERE NOT NULL`) plus a partial UNIQUE on `(related_id) WHERE call_type='tts' AND related_id IS NOT NULL`. The partial unique is the durable guard against the duplicate-TTS-logging regression. Confirmed live via `pg_indexes`: all 4 indexes present (`idx_llm_calls_created_at`, `idx_llm_calls_call_type_created_at`, `idx_llm_calls_related_id`, `idx_llm_calls_tts_unique`).
- 20260511000001 `pois_poi_type_check` — adds `pois_poi_type_check` constraint locking `pois.poi_type` to `('point','area','viewpoint')`. Resolves drift catalog 5.17.

**Applied 2026-05-11 (Prompt 07 activation — see drift catalog 5.23, 5.26, 5.33):**
- 20260510000005 `na_unique_add_mode` — adds `mode` to the unique constraint on `narration_audio` (now `(poi_id, narrator_slug, depth, mode)`). Resolves drift 5.26. The migration was corrected during Prompt 07 to use `ALTER TABLE DROP CONSTRAINT IF EXISTS na_unique` + `ALTER TABLE ADD CONSTRAINT na_unique UNIQUE (…)` because the live shape is constraint-backed (not a bare unique index — see drift 5.33). Coordinated code changes: `onConflict` clauses in [server/routes/narration.js:196](server/routes/narration.js#L196) and [scripts/precache-popular-routes.ts:244](scripts/precache-popular-routes.ts#L244) widened to `'poi_id,narrator_slug,depth,mode'`. Applier: `scripts/poi-import/apply-na-unique-add-mode.mjs`.
- 20260510000006 `remove_unused_poi_categories` — drops `alpine` and `wind_solar` rows from `poi_categories` (both had zero active references). Resolves drift 5.23. Defensive `RAISE EXCEPTION` body refuses to delete if any POI still references either slug; pre-flight confirmed 0 references. Companion code changes done in Prompt 06 already (category-map.ts, wikidata-types.ts, types.ts); Prompt 07 widened the OSM Overpass query in [scripts/poi-import/sources/osm.ts](scripts/poi-import/sources/osm.ts) to fetch `man_made=bridge`, `man_made=dam`, `waterway=dam`, `landuse=quarry` (`historic=mine` is already captured by the existing `[historic][historic!=yes]` line). Backfill reclassified 24 `architecture` → `bridges` and 1,642 `architecture` → `dams` (Wikidata-imported rows). `hot_springs`/`volcanic` backfill returned 0 rows because pre-Prompt-06 imports didn't produce the matching tag values — ~150+ Wikidata volcanoes remain in `nature` with `'summit'` tag and can only be reclassified via re-import. Applier: `scripts/poi-import/apply-remove-unused-poi-categories.mjs`. Backfill: `scripts/poi-import/backfill-category-reclassify.mjs`.

**Applied 2026-05-11 (Bucket-H reconciliation — see drift catalog 5.16, 5.30, 5.35):**
- 20260511000002 `corridors_enum_checks` — adds two CHECK constraints to `corridors`: `region_type` locked to `('geological','desert','suburban','alpine','mountain_pass','rural')`, `editorial_status` locked to `('draft','verified')`. Resolves drift 5.30. Single atomic BEGIN/COMMIT migration. Precedent for `_enum_checks.sql` suffix (multi-column constraint add on one table).
- 20260511000003 `pois_source_drop` — drops `pois.source` (legacy `text NOT NULL DEFAULT 'curated'`). All 23,922 rows carried the default, zero readers, fully displaced by `source_type` (added 20260504000005). Resolves drift 5.16. DROP RESTRICT (no CASCADE) per the convention codified the same day. Precedent for `_drop.sql` suffix.
- 20260511000004 `get_corridor_pois_comment` — attaches `COMMENT ON FUNCTION get_corridor_pois` clarifying that the RPC does not consume `public.corridors` despite the name overlap (function takes a WKT/EWKT LineString in `route_geom` and buffers it by `corridor_width_miles`). Resolves drift 5.35. Precedent for `_comment.sql` suffix (function-level metadata).

**Applied 2026-05-14 (editorial status promotion):**
- 20260514000001 `pois_editorial_status_auto_verified` — adds `auto_verified` to the `editorial_status` CHECK and promotes rule-eligible drafts (`source_type IN ('nrhp','state_landmark','editorial')` OR `significance_score >= 50`). Live: 3,271 rows promoted; final distribution is draft 18,508 / auto_verified 3,271 / needs_geocoding 2,100 / verified 31 / reviewed 12.

**Applied 2026-05-14 (addendum migrations 1–6 — see `docs/roadstory-narration-curation-addendum.md` §11):**
- 20260514000002 `pois_intrinsic_depth` — adds `pois.intrinsic_depth text NOT NULL DEFAULT 'standard' CHECK ∈ {brief, standard, long}` per addendum §4.2. Backfilled all 23,922 rows to `'standard'`. Heuristic assignment job (addendum §4.3) runs later per roadmap Phase G1.
- 20260514000003 `pois_iconic_local` — adds three columns to `pois` per addendum §8.4: `iconic_local bool NOT NULL DEFAULT false`, `iconic_local_reasons text[] NOT NULL DEFAULT '{}'`, `signature_hook text` (nullable). No CHECKs — validation lives in the importer. ~150–300 rows will be flagged later by `scripts/poi-import/sources/iconic-curation.ts` (roadmap Phase F).
- 20260514000004 `category_significance_floors` — new lookup table per addendum §2.2 (`category text PK`, `significance_floor smallint CHECK 0–100`, `notes text`, `updated_at`). Reuses `public.set_updated_at()` trigger. RLS anon SELECT. Empty seed; the app falls back to global 70 floor via `COALESCE`. Curator fills values post-import distribution review (roadmap Phase G2).
- 20260514000005 `regions` — new `regions` table per addendum §3.1 (`geography(MultiPolygon, 4326)` polygon, 5-value `region_type` CHECK, `significance_tier` 0–100, self-FK `parent_region_id`, `set_updated_at` trigger, GiST + b-tree indexes, anon SELECT RLS) + `detect_regions_at_location(p_lat, p_lon)` RPC granted to anon/authenticated. RPC uses `ST_Contains(polygon::geometry, ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326))` per addendum §3.2. No region data loaded yet; importer is roadmap Phase E1, pre-gen is Phase E2. **`region_type='indigenous_territory'` is reserved-not-loaded** pending NLD commercial-license outreach — see [docs/decisions/2026-05-14-nld-deferral.md](docs/decisions/2026-05-14-nld-deferral.md) for licensing finding, conditions to ship, and fallback plan.
- 20260514000006 `narration_plays` — new table per addendum §9.2 with FK to regions/pois/trips/auth.users/narration_audio (all `ON DELETE SET NULL`). Two CHECKs: `poi_or_region_present` (one of poi_id/region_id must be set) and `durations_nonneg` (defensive — not in addendum, locks duration arithmetic sanity). Partial indexes on `poi_id` / `user_id` (`WHERE col IS NOT NULL`). RLS policy `narration_plays_own_rows` (SELECT, authenticated, `user_id = auth.uid()`); writes via service role.
- 20260514000007 `narration_audio_depth_check` — extends `na_depth_check` from 3-value to 7-value union `{glance, ride_along, deep_dive, brief, standard, long, long_compressed}` per addendum §4.4. No data migration — existing 37 narration_audio rows stay on legacy `deep_dive`; app reads with alias mapping (glance↔brief, ride_along↔standard, deep_dive↔long). Applier: `.tmp-apply-migrations.py` (ad-hoc; deleted post-apply). DROP IF EXISTS + bare ADD pattern, BEGIN/COMMIT-wrapped.

**Deferred to Phase D3** (per roadmap §4 — bundled with voice audition):
- `voice_configs.narrator_slug` column add + partial unique index swap from `(mode) WHERE is_active=true` to `(mode, narrator_slug) WHERE is_active=true` + 8 new voice rows (4 audience × 2 narrator). All one coordinated migration.

**Deferred to Phase J** (cleanup belongs with UI refit removing user-facing depth):
- `trips.depth` CHECK (currently 3-value `glance/ride_along/deep_dive`) — vestigial once Pace replaces user-facing depth.
- `user_preferences.default_depth` CHECK + column — same.

**Out-of-band live patches (no migration file — applied directly via pg):**
- `get_corridor_pois` + `get_nearby_pois` RPCs patched (2026-05-06): live DB had diverged to reference a nonexistent `categories` table instead of `poi_categories`. Re-applied both `CREATE OR REPLACE FUNCTION` bodies from `20250503000001_trip_mode.sql` directly. Root cause unknown (likely a hand-edit in the Supabase SQL editor at some point). If you ever reset or re-apply migrations from scratch, these functions will be correct — the migration files were already right.

**Remaining pre-flight before narration works end-to-end:**
- `GOOGLE_APPLICATION_CREDENTIALS` is set and working in root `.env` ✓
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` aliases set in root `.env` ✓
- Add `ANTHROPIC_API_KEY` to root `.env` (single source of truth — server reads from root .env via dotenv when launched from project root)
- Run `cd server && npm install` to get `@google-cloud/text-to-speech` — install is cwd-agnostic; runtime is not. Launch the server from project root: `node server/index.js`
- Run `pnpm audition --mode=<mode>` for all 4 audience modes → listen to output → run `pnpm audition --commit` for each
- After 4 commits: voice_configs has one active row per audience mode → Phase 7 (lazy cache population) is unblocked
- After picks confirmed: wire voice_configs lookup into `generateNarration()` in `scripts/lib/tts/index.ts`
- Run precache: `cd scripts && npx tsx precache-popular-routes.ts --named-route pch-sf-la --dry-run`

## Git + repo hygiene

- **Repo:** `https://github.com/johnhollis99-lgtm/crossroad-ws.git` — main branch on origin/main.
- Git binary (not on PATH): `C:\Users\johnh\AppData\Local\GitHubDesktop\app-3.5.8\resources\app\git\cmd\git.exe`
- **`.gitignore`** — covers: `node_modules/` (all sub-packages), `.env` + `server/.env` (secrets), `.expo/`, `dist/`, `admin/.next/`, `scripts/*/cache/`, `scripts/audition-output/`, `*.opus`, `*.tsbuildinfo`, OS files, `.claude/scheduled_tasks.lock`, `.claude/settings.local.json`, `supabase/.temp/`, plus session-scoped pre-handoff working notes (`docs/alignment-plan.md`, `docs/codebase-audit.md` — added 2026-05-11 per chore(gitignore) commit, files retained locally for historical context).
- **Recent commit history (top of `main`, 2026-05-15):**
  - `9ced1c7` feat(regions): E1d Tier C polygon derivation script + v1.1 doc update (LTBMU/Hetch-Hetchy-reservoir-buffer/Sierra-Valley-centroid-bbox drafts to `data/editorial-named-valleys.geojson`; Class B osm_linear_to_bbox section in v1.1 doc)
  - `9418afd` feat(regions): E1d Phase 4 — live import 27 named valleys (51 regions total) (25 Haiku calls × $0.0577; osmtogeojson + geodesic-circle Wikidata buffers; ST_MakeValid on Anza-Borrego ring self-intersection; Salinas Valley editorial parent override to Coast Ranges)
  - `8682694` docs(regions): E1d v1.1 polygon-followups — SJV + LA Basin inadequacy
  - `253d692` feat(regions): E1d Phase 1–3 — candidate list + polygon verification + samples (osmtogeojson dep added; 4-iteration verification with location-sanity + AVA-by-tag + plausibility checks; 2 tone-check samples)
  - `e5dcce8` docs(regions): E1d Phase 1 — curator-annotated candidate list (top 80 with curator boost annotations; Castro Valley dropped, 11 rows boosted, Mono Basin = 2)
  - `2c3fecd` docs(regions): E1c deferred — NLD commercial-license outreach in flight (native-land.ts stub removed; schema enum value 'indigenous_territory' reserved-not-loaded)
  - `2c35393` feat(map-style-picker): add 40x40 thumbnails back to dropdown rows (reverses drift 5.98; SVG swatches, no Mapbox network)
  - `a10cee5` fix(map-style): AsyncStorage persistence on native so user-selected style survives cold start
  - `128fe0f` fix(customize): add key={mapStyleId} to MapView for style change to take effect on Android
  - `b681329` refactor(customize): unified header card matching home pattern (nav + Strip A + Strip B in one card; MapStylePicker re-ordered as last child for paint order)
  - `05c0b39` refactor(home): remove redundant chip rail; category selection owned by customize page
  - `782dab1` fix(map): PNG-based cluster markers — bypass Android bitmap capture race (in-memory PNG cache + pre-warm 5–50 + react-native-svg toDataURL; loses cluster animation as documented tradeoff)
  - `8da6778` fix(map): more aggressive cluster condensing at low zoom — radius 60 → 80 (drift 5.94)
  - `8a958e4` feat(brand): map style picker palette match (drift 5.98)
  - `42dac68` fix(map): cleaner cluster bubble — tabular mono count + lift shadow (drift 5.94)
  - `f8fcca4` fix(map): inline POI Markers under ClusteredMapView so clusterer detects them (drift 5.94)
  - `3cc7953` feat(map): enable clustering post-route with minPoints=5 density threshold (drift 5.94)
  - `c046f5e` fix(map): restore cluster condensing after X-marker integration (drift 5.94)
  - `64be41f` fix(map): pin-drop coordinates float above pin instead of overlapping add-stop menu (drift 5.99)
  - `589a799` fix(filter): wire chip + slider toggles to RPC + stats (drift 5.96)
  - `0b78e99` fix(map): callout dwells + tap-to-toggle on home (drift 5.97)
  - `f6f5073` feat(map): X-shaped POI markers + working callout overlay on home (drift 5.94 + 5.97)
  - `1b8e7c8` fix(brand): chip active = accent (ink-red), inactive = paperDeep (drift 5.95)
  - `8adb0ab` feat(brand): filter chip on/off contrast matching mode pill (drift 5.95)
  - `55ab707` fix(brand): mode pill paper backing + shadow on map overlays (drift 5.93)
  - `bbef865` feat(brand): mode pill contrast + Hike/Walk label + flanking icons (drift 5.93)
  - `47103a0` fix(brand): wordmark capital R + paper pill on map overlays (drift 5.92)
  - `6adecc9` feat(brand): wordmark B swap — bicolor X, canonical horizon (drift 5.92)
  - `a965214` feat(home): migrate app/index.tsx to Field Notes design tokens (Layer 1) (2026-05-12)
  - `98d8243` feat(design-system): ship Phase 1 — Field Notes tokens + components (2026-05-12)
- **Deferred arcs awaiting follow-up prompts (2026-05-12 EOD):**
  - **5.27 Path 3 implementation** — drop `trips.route_id` column + remove three write sites (`app/index.tsx:528` route object literal `id: ''`, `app/customize.tsx:477` saveTrip payload `routeId:`, `lib/supabase.ts:217+236` SaveTripParams type + INSERT). Add migration `<today-prefix>000NNN_trips_route_id_drop.sql` (date prefix MUST match local-clock creation day per L652 convention). Edit CLAUDE.md trips bullet to drop the `route_id` clause. Update drift catalog 5.27 status to `Resolved`, attaching the rationale-correction note that customize.tsx was clean (not dirty as the original entry claimed). `app/drive.tsx`'s 5 `routeId` references are socket-room naming — out of scope.
  - **Design-system integration commit** — ✅ **RESOLVED** 2026-05-12 via commit `98d8243` (`feat(design-system): ship Phase 1 — Field Notes tokens + components`). 25 files / 2,201 insertions. See "Design system" section above.
  - **Drift 5.42 (open) — `pointerEvents` buried in style in two more spots in `app/index.tsx`.** Catalog entry LANDED in commit `bf3617f` (2026-05-12) alongside the SafeAreaView fix. Post-Layer-1 line numbers: 869 inside the `s.desktopPillWrap` StyleSheet entry (with `as any` cast; its consumer at line 1317 redundantly passes a top-level `pointerEvents="box-none"` prop, so runtime is fine but the dead style entry reinforces the wrong pattern), and 1165 on the chip-row `<ScrollView style={{ pointerEvents: 'box-none' } as any}>` (actually-buggy: ScrollView absorbs taps instead of forwarding to chip TouchableOpacity rows). Apply the fix in a dedicated small commit; do not touch unrelated lines.
  - **Drift 5.41 (open) — 29 pre-existing tsc errors.** Repo-wide `npx tsc --noEmit` fails with 29 errors across `admin/` (15, Next.js path-alias resolution), `app/drive.tsx:335` (2, removed `setStoryCount` call site), `lib/__tests__/routeBadges.test.ts` (9, `BadgeRoute` widened), `scripts/poi-import/lib/category-map.ts:27` (1, typo), `scripts/precache-popular-routes.ts:434` (1, type narrowing). Cleanup arc on hold until a future session — does not block ongoing work but tooling like pre-commit type-gates can't run repo-wide until resolved.
  - **Drift 5.44 (open) — brand-mark color literals in `app/index.tsx`.** Three references to `#2EC4B6` (×2) and `#1a1208` remain in MapScreen's StyleSheet (`logoPinOuter` / `logoPinInner` / `brandX` entries) — deferred to Layer 2 when these get replaced wholesale by importing the canonical `src/components/Wordmark.tsx`. Filed in commit `a965214`.
  - **Drift 5.45 (open) — color-distinction collapses from Layer 1 home-screen migration.** The 15→9 token collapse merged `STOP+ACCENT_TEXT → accent2`, `WARNING+WARNING_BRIGHT+DANGER → accent`, and `BORDER_STRONG+BG_ELEVATED → cardEdge`. Most user-visible regression: the origin-search-dot ternary at the search card no longer distinguishes GPS vs manual mode by color (both branches now resolve to `accent2`). Address in Layer 2 with non-color signals (icon / border treatment / label) rather than re-introducing a per-state color. Filed in commit `a965214`.
  - **Layer 2 home-screen migration** — follow-up to commit `a965214`. In scope: (1) resolve drift 5.44 by replacing the inline brand-mark assembly (`logoX` / `logoXBar1/2` / `logoPinOuter` / `logoPinInner` / `brand` / `brandX`) with `<Wordmark/>`; (2) resolve drift 5.45's GPS-vs-manual dot regression; (3) replace hand-rolled search-card / customize-CTA / route-card patterns with Field Notes components (`Card`, `PrimaryButton`, `Kicker`). Likely also a candidate moment to swap modal scrim `rgba(0,0,0,0.6)` for a themed dim if a primitive emerges. Token-only Layer 1 is the foundation; Layer 2 is component replacement.

## Region import pipeline (`scripts/region-import/`)

Standalone Phase-E1 ingestion package — own `package.json`, separate `npm install` from poi-import. Pulls geographic region polygons from authoritative sources, drafts third-person factual seed text via Haiku (canonical `SEED_TEXT_SYSTEM_PROMPT` in [scripts/region-import/lib/anthropic.ts](scripts/region-import/lib/anthropic.ts)), upserts to `public.regions`.

### Phase E1 status (2026-05-15)

| Phase | Source | Rows | Status |
|---|---|---:|---|
| E1a | USGS / California Geological Survey Geomorphic Provinces | 11 | Live ✓ |
| E1b | EPA Level III Ecoregions | 13 | Live ✓ |
| E1c | Native Land Digital indigenous territories | 0 | **Deferred to v2** — see [docs/decisions/2026-05-14-nld-deferral.md](docs/decisions/2026-05-14-nld-deferral.md) |
| E1d | Named valleys/basins | 27 + 3 pending | Live (27/30); 3 Tier C in DRAFT awaiting greenlight |
| E1e | Watersheds (HUC8) | 0 | Not started |

**Total regions in DB: 51** (11 + 13 + 27). After Tier C lands: 54.

### Pipeline scripts

| Script | Purpose |
|---|---|
| `run.ts` | CLI entry — `import:regions` runs registered sources (`usgs`, `epa`, `named_valleys`) |
| `sources/usgs-provinces.ts` | E1a importer (geomorphic provinces from CGS shapefile) |
| `sources/epa-ecoregions.ts` | E1b importer (EPA L3 ecoregions from shapefile + DOCX descriptions; uses shared `lib/anthropic.ts` canonical prompt) |
| `sources/named-valleys.ts` | E1d importer stub — actual work split across the 4 phase scripts below |
| `build-named-valleys-candidates.ts` | E1d Phase 1: top-N candidate list from Wikipedia category + Wikimedia pageviews → markdown worksheet for curator boost annotation |
| `verify-named-valleys-polygons.ts` | E1d Phase 2: per-region polygon-source resolution (OSM name-match + location-sanity 50km filter + tag-fallback by type + Wikidata-buffer with 15km heuristic when no P2046 area; AVA name-keyword filter; tiny-geological override + area-plausibility check) |
| `seed-sample-owens-and-lvc.ts` | E1d Phase 3: two-sample tone-check before bulk Haiku spend |
| `live-import-named-valleys.ts` | E1d Phase 4: live upsert of 27 non-Tier-C regions; osmtogeojson for OSM relation polygon assembly + 64-point geodesic circle for Wikidata buffers + bbox-rectangle fallback for unclosed LineStrings |
| `derive-tier-c-polygons.ts` | E1d Tier C derivation pass — Lake Tahoe LTBMU + Hetch Hetchy reservoir-buffer + Sierra Valley centroid bbox → `data/editorial-named-valleys.geojson` (DRAFT) |

### Polygon source conventions (`metadata.polygon_source`)

- `osm_natural_valley` / `osm_natural_basin` / `osm_natural_desert` / `osm_natural_badlands` — geological OSM tags
- `osm_boundary_viticulture` / `osm_ava_landuse_vineyard` / `osm_boundary_wine` — wine appellation (AVA)
- `osm_protected_area` / `osm_boundary_national_park` — protected admin (accepted per-region via `acceptedPolygonTypes`)
- `osm_boundary_admin_level_6_county` — county-level approximation (must pass one-OOM area plausibility check)
- `wikidata_<QID>_centroid+buffer_<radius>km` — Wikidata centroid + 64-point geodesic circle; radius = `Math.sqrt(area_km² / π)` when P2046 set, else 15km if Wikipedia extract contains a region-type keyword (valley/basin/plain/caldera/desert), else 5km default
- `derived_osm_ltbmu` / `derived_osm_lake_buffer` / `derived_osm_reservoir_buffer` — Tier C derivation paths
- `editorial_approximation` — Tier C bbox-rectangle from Wikidata centroid (Sierra Valley)

### Polygon-quality flags (`metadata.polygon_quality`)

Two values currently in use; auditable via `metadata->>'polygon_quality'` query:

- `inadequate_buffer_v1` — Wikidata 15km buffer is 1–10% of real area; v1.1 followup. **Set on: San Joaquin Valley, Los Angeles Basin** (only).
- `osm_linear_to_bbox_v1` — OSM way is an unclosed LineString (linear feature for valley axis, not closed boundary polygon); bbox-rectangle approximation in use. **Set on: Cuyama Valley, Panamint Valley, Yosemite Valley.**

Both classes documented in [docs/decisions/v1.1-polygon-followups.md](docs/decisions/v1.1-polygon-followups.md) with rationale + candidate fix paths. Lower-priority Class B (osm_linear_to_bbox_v1) over-triggers slightly; Class A (inadequate_buffer_v1) under-triggers by 10–40×.

### Parent resolution

Named valleys + ecoregions get `parent_region_id` via centroid → `ST_Within(geomorphic_province.polygon)` lookup; fallback to `ST_Intersects` area-largest if centroid is outside every province. Resolution method captured in `metadata.parent_resolution_method` ∈ {`centroid`, `area_intersection`, `editorial_override`}.

**One editorial override** in E1d: **Salinas Valley** — Wikidata centroid (36.765°N, -121.792°W) falls in a 15.6 km province-coverage gap; manually assigned to Coast Ranges with `metadata.parent_resolution_note` explaining the gap.

### LLM spend (E1a + E1b + E1d)

$0.1301 total across 57 Haiku 4.5 calls (`claude-haiku-4-5-20251001`), all logged to `llm_calls` with `call_type='claude'`. Per-region average ~$0.0023 for 1,500–2,100 char descriptions.

### Tier C status (E1d follow-up)

3 regions originally Tier-C-manual-digitization → one lap of `derive-tier-c-polygons.ts` reduced to 0 manual cases via real-data derivation:

| Region | Source | Polygon area | Status |
|---|---|---:|---|
| Lake Tahoe Basin | USFS LTBMU boundary (OSM `boundary=protected_area`) | 609.6 km² | Draft ready; awaiting greenlight |
| Hetch Hetchy Valley | OSM reservoir (natural=water) + 2km buffer | 75.7 km² | Draft ready |
| Sierra Valley | Wikidata centroid bbox 40km × 25km | 1,004.5 km² | Draft ready (editorial approximation) |

Draft GeoJSON at `scripts/region-import/data/editorial-named-valleys.geojson` (gitignored alongside `cache/`). After curator greenlight, `live-import-tier-c.ts` will upsert these 3 with ~$0.007 Haiku spend. Then E1d is fully closed and the next phase is **E2 — region narration pre-generation**.

### Decision records

The `docs/decisions/` folder captures dated decisions affecting region-import design:

- [docs/decisions/2026-05-14-nld-deferral.md](docs/decisions/2026-05-14-nld-deferral.md) — E1c (NLD indigenous_territory) deferred to v2 pending commercial-license outreach
- [docs/decisions/2026-05-14-named-valleys-candidates.md](docs/decisions/2026-05-14-named-valleys-candidates.md) — E1d Phase 1 boost-annotated candidate worksheet (top 80, curator boosts marked)
- [docs/decisions/v1.1-polygon-followups.md](docs/decisions/v1.1-polygon-followups.md) — Class A + Class B polygon-quality v1.1 followup work list

## scripts/seed-db.mjs

One-time DB seeder (categories, POIs, corridors, badges). Uses Supabase Management API — requires `SUPABASE_ACCESS_TOKEN` (personal access token from dashboard, NOT the service key).

- Reads `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from `.env` via `dotenv/config` (fails loud if missing)
- `PROJECT_REF` derived from `SUPABASE_URL` hostname — no hardcoded project ref
- `SERVICE_KEY` is validated on startup but currently unused in the script body (Management API uses `ACCESS_TOKEN`)

## Narration precache script (`scripts/precache-popular-routes.ts`)

Standalone script (run with `npx tsx` from `scripts/`). Pre-generates narration audio for all eligible POIs along a route, covering the top (trip-mode, depth) combos from the trips table.

```
cd scripts
npx tsx precache-popular-routes.ts --named-route pch-sf-la
npx tsx precache-popular-routes.ts --route-file ./routes/pch.geojson
npx tsx precache-popular-routes.ts --named-route pch-sf-la --dry-run
npx tsx precache-popular-routes.ts --named-route pch-sf-la --mode driving --depth glance
```

**Options:** `--route-file <geojson>`, `--named-route <id>`, `--corridor-mi <n>` (default 10), `--mode`, `--depth`, `--dry-run`, `--limit <n>`, `--min-score <s>` / `--max-score <s>` (apply in both corridor and top-N modes; corridor filters post-fetch, top-N pushes into SQL), `--exclude-ids <uuid,uuid>` (drop specific POIs from the result; runs after the score filter so typo'd UUIDs still warn as "not in selected set")

**Named routes:** `pch-sf-la`, `i5-sf-la`, `us101-la-sf`, `us101-la-cambria` (hardcoded WKT waypoints)

**Smoke batch (LA→Cambria corridor, Family Deep Dive) — LANDED 2026-05-10:**
```
# 1. Resolve UUIDs for the two known-bad selections (run once before the live batch):
#      SELECT id, name, significance_score
#        FROM pois
#       WHERE merged_into IS NULL
#         AND name IN ('Hollywood Walk of Fame')      -- duplicate of "Walk of Fame"
#          OR name LIKE 'Jurassic World%';            -- venue child (Universal Studios)
#    Plug the two UUIDs into the --exclude-ids list below.
# 2. Live invocation (after Family voice committed via audition):
npx tsx scripts/precache-popular-routes.ts \
  --named-route us101-la-cambria \
  --mode driving --depth deep_dive \
  --corridor-mi 10 \
  --min-score 70 \
  --audience family \
  --exclude-ids <hollywood-walk-of-fame-uuid>,<jurassic-world-uuid>
# Pipeline (verified 2026-05-10):
#   2,947 in corridor → 39 after --min-score 70 → 37 after --exclude-ids
#   Actual run: 795s (~13min) across 37 POIs, all status=ready.
#   Actual spend: ~$1.05 real (Claude $0.18 + Google TTS $0.87).
#   Note: llm_calls double-counts TTS rows (auto-log + explicit
#   precache log = 2x); raw sum reports ~$1.92.
```
Verified end-to-end on 2026-05-10. Voice committed: Iapetus / family / rate 1.0 (`voice_configs.id=b0d81862-de44-42fe-9c25-3ff4838cf5ad`). 37 narration_audio rows, 37 Storage objects under `narration-audio/{poi_id}/driving/deep_dive/en-US-Chirp3-HD-Iapetus.opus`, 37 `pois.narration_cache` keys, 37 narration_text values (1,310-1,614 chars, median 1,438).

Known noise in the >=70 set: Walk of Fame / Hollywood Walk of Fame duplicate (data-quality-issues.md), and Jurassic World—The Ride is a Universal Studios venue child surfaced because `get_corridor_pois` deliberately omits the `parent_poi_id IS NULL` filter (migration 000018 design note — corridor narration may want children at slow drive-by). Both flagged for exclusion via `--exclude-ids` rather than touching the RPC.

**Three audit / display quirks uncovered during the smoke batch (worth a follow-up PR):**

1. **Trip-mode vs audience-mode collision.** Pre-PR-I the precache script passed `--mode driving` (trip taxonomy) directly to `voice_configs.mode` (audience taxonomy: family/kids/unfiltered/local). The CHECK constraint rejected the lookup. Fixed by adding `--audience <a>` flag (default `family`), routing voice lookup through it. **server/routes/narration.js has the same shape — works by coincidence because the mobile client passes audience-mode as `mode` in the request body.** A unified audience-mode parameter across both writers (and the mobile call site) is the proper fix.

2. **Bucket MIME exact-string match.** `storage.buckets.allowed_mime_types` does exact-string matching, not RFC 7231 parameter-aware comparison. The Google TTS wrapper returns `audio/ogg; codecs=opus`; the bucket's original allow-list only had `audio/ogg` and `audio/opus`. Every upload failed silently from the bucket's view but ate Claude + TTS spend upstream. Fixed by migration 20260504000021 extending the allow-list. Worth considering whether `; codecs=opus` should be stripped at upload time instead (smaller blast radius).

3. **Claude cost-logging happens after Storage upload.** `scripts/precache-popular-routes.ts` logs `llm_calls` row for both Claude and TTS **inside** the try block, after `uploadAudio()`. If the upload throws, both costs go untracked even though both API calls already billed. During the 2nd smoke-batch attempt (MIME-rejection era), ~28 POIs incurred ~$0.27 untracked Claude spend before the script was stopped. TTS partially escaped this because `scripts/lib/tts/index.ts` `generateNarration()` auto-logs TTS via `logCost` independently (which is also why successful runs **double-count** TTS — once via the abstraction, once via precache's explicit log; raw sum is 2× actual). Fix: log costs immediately after each provider call returns, before downstream steps that can throw.

**Logic:**
1. Calls `get_corridor_pois` RPC → re-fetches full POI rows for `narration_cache`, `source_type`
2. Skips `source_type = 'narrative_extracted'` (need user validation first)
3. Queries `trips.depth` distribution → derives top trip-mode×depth combos (default: driving + hiking × top 3 depths)
4. Reads active voice per audience mode from `voice_configs`
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
- `status='failed'` rows older than 24 hours: may have a Storage object if upload succeeded but ready-update failed. Attempts Storage delete at `{poi_id}/{trip_mode}/{depth}/{narrator_slug}.opus` (404 is ignored), then deletes DB row.

**Intended cadence:** hourly cron. Schedule via `crontab` or a task scheduler once the server is deployed.

## Open architectural concerns — required before launch

Items that aren't bugs but are load-bearing decisions that must land before the v1 public launch. Resolve, document the resolution, and remove from this section.

### Curator-gated POI TTS before Phase H bulk runs (raised 2026-05-15)

The addendum's significance-floor model (global 70, architecture 80–85 per [docs/roadstory-narration-curation-addendum.md §2.2](docs/roadstory-narration-curation-addendum.md)) is the **automated** floor. Curator wants a **human-review step in front of bulk TTS generation** for the upcoming POI narration phase — not auto-bulk-TTS for every POI that clears the significance floor.

Specific concern: even with the architecture floor at 80–85, the long tail of NRHP-listed Methodist churches, generic Mission Revival churches, and anonymous mid-century office buildings is large enough that bulk TTS would burn Claude + Google TTS spend on narrations no listener would value. Curator wants to **see the list and greenlight per-POI (or per-category-slice)** before TTS fires.

Implementation options to evaluate before Phase H starts (not yet picked):

- **CLI list-export-review-greenlight loop** — script emits a CSV/JSON of POIs that would generate, curator marks approve/reject in a spreadsheet, script reads it back and generates only approved rows. Cheapest path. Iteration cycle per slice ~hours.
- **Curator-facing admin UI** — extend [admin/](admin/) with a per-POI approve/reject queue, similar to `poi_review_queue` but for TTS gating. Higher implementation cost; better iteration cycle once built.
- **Hybrid** — UI for slices likely to be high-volume (architecture, religious_complex), CLI for one-off curation.

Decision required: pick an approach during Phase H planning. The current addendum text presumes auto-bulk-TTS-above-floor; that presumption is overridden by this note. Sub-floor POIs (significance < category floor) are still imported into the catalog and remain queryable, just don't generate audio unprompted — that part of the addendum stands.

This concern is independent of [docs/decisions/2026-05-15-narrator-b-prosody.md](docs/decisions/2026-05-15-narrator-b-prosody.md) (which addresses *region* narration prosody) — they share the "don't auto-spend without curator eyes" principle but operate on different content surfaces.

**Resolution path landed 2026-05-18:** the hybrid curation model + `editorial_curated` schema + `scripts/curation/{export,import}.ts` markdown-checklist loop. See [docs/decisions/2026-05-15-top-tier-poi-first-run.md](docs/decisions/2026-05-15-top-tier-poi-first-run.md) §Curation Model. Removal from this section pending v1 launch + first full curator workflow lap proving the model end-to-end (currently mid-lap: 189 POIs curated, TTS run in progress).

### Driving-mode cluster suppression in the lookahead worker (raised 2026-05-18)

The curator-gated editorial set provides per-POI quality filtering but does not encode per-mode surfacing density. Per [docs/roadstory-narration-curation-addendum.md §10.3](docs/roadstory-narration-curation-addendum.md), the same POI can be **prime drive-by material** in a sparse rural segment yet **redundant noise** in a dense urban one — curator approves liberally for the catalog; the runtime decides per-mode whether to surface.

**Concrete rule the lookahead worker must implement (driving mode only):** when ≥3 same-category approved POIs (defaults: `cluster_min_count=3`, `cluster_radius_corridor_mi=5`) fall within a corridor distance window along the route, only the top-of-cluster entry (highest `significance_score + editorial_score_boost`) surfaces in driving mode for that trip. Suppressed POIs **remain in the catalog** and surface normally in Walking/Hiking (80m proximity + walking pace naturally bound the trigger set) and City Sightseeing (tap-to-hear; user controls density).

**Why this lives here, not in the addendum-only:** the cluster-suppression pass is a **server-side lookahead worker change** with code surface in the WS server's queue pipeline, not a pure spec/curation concern. It needs an implementation prompt during Phase I.

**v1 status — not blocking.** The 189-POI v1 launch slate is sparse enough across California that driving-mode density rarely fires. The rule is captured here so the runtime work is scoped before the slate grows. Bundles with other lookahead-worker work in Phase I (per addendum §10).

## Completed v1 work (catalog v1 closed 2026-05-19)

Snapshot of what's landed in main as of catalog-v1-close. Curator-approved verification samplers cleared the final cycle; no further policy changes or generation cycles in flight. See [docs/decisions/2026-05-15-top-tier-poi-first-run.md](docs/decisions/2026-05-15-top-tier-poi-first-run.md) §Catalog v1 closed for the full close-out detail.

- **Editorial curation model + interface.** Hybrid algorithm-surfaces-curator-gates model. Migration `20260518000003_pois_editorial_curation.sql` adds the gate schema (`editorial_curated`, `editorial_curation_note`, `editorial_curated_at`, `editorial_curated_by`, `editorial_score_boost`). `scripts/curation/` package (export.ts + import.ts) drives the markdown-checklist loop end-to-end with `[x]/[r]/[+]/[+N]` decision marks, Curator Additions (bare-name fuzzy / hint / kv-parens new-seed), editorial>score ambiguity tiebreaker, and abbreviation + park-suffix loose-normalize matching (`Mt.→Mount`, `St.→Saint`, `Devils Postpile↔Devils Postpile National Monument`).
- **Region narrations — 108 generated.** Production set: 54 regions × `narrator_b × Family/Local` voices. Generated during the prosody arc + early-session region work. Per curator's "do not rewrite" rule: untouched after the prosody pipeline final state landed; new region matrix expansions (kids / unfiltered) await audience-expansion priority pick.
- **POI narrations — 187 generated, 189 curated.** Curator-gated set: `editorial_curated = TRUE` × `narrator_b × Family × Sadachbia 1.0 × standard depth`. 2 POIs (Monte Cristo Range, Burnt Peak) failed cycle-4 Haiku JSON output drift; recovery candidates for the parse-retry follow-up on next bulk run. Storage paths stable at `pois/{poi_id}/narrator_b_family_standard.opus`.
- **Prosody pipeline final state.** SSML mode with marker-syntax → tag conversion, PUA-protected placeholder pass, cardinal-content sanitization (commas + now decimals), highway-context skip, calendar-year skip, decimal skip, marker-frequency floors in template, phonetic spelling for highways/years/decimals as primary path with skips as safety nets. Plain-text fallback path on SSML parse failure. 10 unit tests at `scripts/lib/tts/__tests__/ssml.test.ts` lock the number-handling cases.
- **Soul-doctrine rebalance (B1 + A1) applied.** Migration `20260518000002_category_significance_floors_seed_b1.sql` seeds geology=60 / nature=65 floors. `recompute-significance.ts` extended with Wikidata P31-class bonus (+10 for mountain / lake / waterfall / volcano / cave / fault / hot-spring / valley / plateau / island). 21,906 POIs recomputed; +27 newly above the 70 threshold, +70 in the 65–79 band; surfaces legitimate California geology / nature features that the global 70 floor was hiding. Nevada bleed amplified into the top 30 by A1 — captured as v1.1 SPARQL `wdt:P131+ wd:Q99` follow-up. Editorial-tiebreaker rule first recorded use: Mount Whitney.
- **Mode-dependent significance design captured.** Addendum §10.3 mode-dependent significance and density-aware ranking — the "green church on US-395 vs. 15 churches in downtown LA" canonical illustration. Walking/Hiking and City Sightseeing surface every approved POI; driving mode applies cluster suppression (top-of-cluster when N≥3 same-category POIs in 5-corridor-mi). Curation implication captured: approve liberally for the catalog; runtime handles mode-specific suppression. **Implementation** is Phase I lookahead-worker work (not v1-blocking; rule captured in "Open architectural concerns" above).
- **Conversational Query Mode captured.** v1.5 design lap doc at [docs/decisions/2026-05-18-conversational-query-mode.md](docs/decisions/2026-05-18-conversational-query-mode.md). Push (narration) vs. pull (query) paradigms — same brain, different interaction trigger. External-data policy options (A editorial-only / B partner data / C hybrid-opt-in) deferred to v1.5 design lap. v1 anti-preclusion checklist (3 items) so push-build doesn't paint pull into a corner: audio queue priority enum room, `server/prompts/queries/` namespace reservation, driving-page UI button slot.
- **Phase E (Regions Import & Generation) — done.** All region polygon imports, parent resolution, region-narration generation completed. NLD (`indigenous_territory`) deferred to v2 per commercial-license outreach in flight ([docs/decisions/2026-05-14-nld-deferral.md](docs/decisions/2026-05-14-nld-deferral.md)).
- **Most of Phase G (Depth Assignment + Significance Tuning) — done.** Significance tuning fully reconciled (B1 + A1 applied + curator-gated editorial layer on top). Depth-assignment job NOT done; all 21,906 live POIs sit at `intrinsic_depth = 'standard'` per default. Brief / long depth heuristic remains an open Phase G1 item.
- **Partial Phase B (POI Data Pipeline) — done up through editorial curation.** 5 importers live (OSM, Wikidata, NRHP, CHL, GNIS). Dedup Phase A (spatial) + Phase B (name-collapse) live. Significance recompute live (5 components: source_base / cross_source / pageviews / route_adjacency / p31_bonus). Editorial seed mechanism via `scripts/curation/import.ts` Curator Additions (manual boost + net-new seed with coords). **Not done:** narrative extraction phase (Phase B6), GNIS importer expansion (C1 — bundles with the Nevada-bleed SPARQL fix in v1.1).

**Cumulative spend at close: $15.64** ($2.52 Claude + $13.12 TTS, per `llm_calls` lifetime audit). Per-narration cost averages ~$0.053 across all 295 v1 narrations.

## Session workflow

When context fills (PreCompact hook fires), update this CLAUDE.md with current project state, then `/clear` to restart fresh. Proactively save when significant new screens, migrations, or server routes are completed. This file is the single source of truth — MEMORY.md just points here.

### Workflow notes

- **Audit-first prompts validated.** Three debugging arcs this session (cluster bug, customize MapView key, drag-to-expand peek) used the audit-first → premise-notes → greenlight → apply pattern. Each surfaced root cause vs symptom early and prevented iteration loops. **Apply to any non-trivial implementation.** See drifts 5.94 sub-drift, 5.101, 5.104 in `docs/drift-catalog.md`.

- **Scope expansion belongs to the owner.** Claude Code reports premise notes, asks for direction; owner explicitly approves before any commit beyond current scope. Do not pre-stage multi-file PRs as "the next commit" without approval. Boundary clarified this session after a default-map-style-flip proposal was presented as decided rather than as a proposal. **Pattern:** Claude Code drafts premise notes → asks for owner direction → applies only after explicit greenlight.

- **Handoff push count is unreliable.** Session-2026-05-13 handoff claimed ~66 unpushed commits; origin was actually current at session open. **At session open, verify push state with `git log origin/main..HEAD`** before acting on handoff claims about unpushed work.

- **Pine motion infra absent.** Reanimated, gesture-handler, and `@gorhom/bottom-sheet` are NOT installed (verified against `package.json` during the customize drag-to-expand audit). Pine spec called for 5 keyframes + rotating cluster ring + breath pulses, all implemented today against RN core `Animated` + `PanResponder` (no new deps added). Either Pine motion is implicitly deferred or the spec assumed library presence. **Clarify with Claude Design on next touchpoint** whether to install the Reanimated stack (motion fidelity gap on dynamic spring physics and gesture composition) or stay on RN core (current state is functional and matches `hooks/useSheetSnap` precedent across screens). See drift 5.104.
