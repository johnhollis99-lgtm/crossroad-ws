# RoadStory — Narration & Curation Design Addendum

**Status:** Locked-in design (v1.0)
**Audience:** All future query path work, importer pipelines, frontend trip setup, narration generation, and admin tooling.
**Scope:** California (launch) → all states → international.
**Companion docs:** `venue-tour-design.md`, `roadstory-poi-pipeline-prompts.md`, `SKILL.md`.

---

## 0. Why This Addendum Exists

The original RoadStory architecture treated every POI as roughly equal — a flat catalog filtered by category and audience. That model breaks down once you ask the question that defines this product:

> *"What does this place actually have to say?"*

A fire station has nothing to say. A 4.2-star burger spot has very little to say. A 19th-century Methodist church listed on the NRHP because the wrong county committee filed paperwork in 1973 has, honestly, very little to say to someone driving past at 65mph. But the Long Valley Caldera, the Mono Lake tufa, Manzanar, Schat's Bakkery, the Cabazon Dinosaurs, the moment you crest a pass and drop into a new geomorphic province — these things have *a lot* to say, each in a different register.

This document specifies the curation layer that decides what speaks, how loud, in what voice, and for how long. It locks in nine changes:

1. **Phase 7 — Regions:** polygon-based narration for geomorphic, ecological, and anthropological zones
2. **Narrative Focus:** Soul (default) / + Local Color (opt-in) / Custom
3. **Significance floor of 70 across the board** (with per-category tuning when data exists)
4. **Intrinsic POI depth weight** (Brief / Standard / Long) — a data property, not a user setting
5. **Two-narrator model** replacing the previous four — both deliver the full depth range, differentiated by posture and conversational register
6. **Pace setting** (Full Drive / Light Touch) — kept as user choice
7. **Iconic Local Override** — strict bar, free-tier sources only for v1
8. **Skip / Tell Me More controls** plus a three-report feedback loop
9. **Mid-trip narrator swap**

Each section below is a self-contained spec. Read in order; later sections assume earlier ones.

---

## 1. The Soul Doctrine

This is the product position. Every other decision in this document descends from it.

> **The soul of RoadStory is geology, geography, and anthropology.** Architecture and history count when significant. Everything else is opt-in.

This is not "we have a lot of categories and let users filter." It is "we have a default voice → the land speaks → and users can layer flavor on top of it." The data pipeline is already biased toward the soul (history sources like NRHP and CHL, Wikipedia-backed Wikidata, named natural features in GNIS, curated narrative extraction). This addendum hardens that bias at the query layer.

### 1.1. The category tiers

| Tier | Categories | Default state |
|---|---|---|
| **Soul** | geology, geography, indigenous/anthropology, history (NRHP/CHL/archaeological/named historic sites), natural features (named peaks, falls, caves, hot springs, geological landmarks), regional zones | **Always on** |
| **Cultural Fabric** | music venues, public art, notable churches | **Opt-in via Narrative Focus, gated by historical + resonance bar (§7.2)** |
| **Local Color** | restaurants, breweries, theme parks, water parks, playgrounds, modern shopping, contemporary attractions | **Opt-in via Narrative Focus** |
| **Iconic Local Override** | food/drink, roadside oddities, Americana lodging/diners that pass the strict iconic bar (§8) | **Always on regardless of focus** |
| **Regions** | geomorphic provinces, ecoregions, watersheds, indigenous territories, named valleys | **Always on (rate-limited, §3)** |

### 1.2. Trip setup user choice

Trip setup presents two clean cards plus an advanced option:

- **The Land Speaks** *(default)* — Soul tier only. Iconic Local Override still fires. Region transitions still fire. This is the product's headline experience.
- **+ Local Color** — Adds restaurants, theme parks, modern attractions to the surface set. Soul still dominates the airtime (§5.2).
- **Custom** — Power users toggle individual category groups. Buried one tap deep so casual users don't see it.

The default is **The Land Speaks**. A user who never touches settings gets the product the way it was designed to be experienced.

---

## 2. Significance Floor

### 2.1. The 70 floor

A POI must clear `significance_score >= 70` (on the 0–100 scale defined in the existing pipeline) to trigger an unsolicited narration. POIs below 70 are still imported, deduped, indexed, and queryable — but they never speak unprompted.

What they're still used for:
- Map dot rendering on the driving/hiking/city pages
- "What's around me" tap-to-explore queries
- Future re-evaluation as cross-source signals accumulate
- Search results when a user explicitly looks something up

What they don't do:
- Trigger lookahead narrations
- Compete for queue slots

### 2.2. Per-category floors (tunable)

A single global 70 is the v1 default. A `category_significance_floors` lookup table allows per-category tuning once we can see the actual accrual list:

```sql
CREATE TABLE category_significance_floors (
  category text PRIMARY KEY,  -- references the existing category enum
  significance_floor smallint NOT NULL CHECK (significance_floor BETWEEN 0 AND 100),
  notes text,
  updated_at timestamptz DEFAULT now()
);

-- Initial seed (placeholder, tuned post-import review):
INSERT INTO category_significance_floors VALUES
  ('geology',      60, 'Geological POIs earn presence at lower thresholds'),
  ('nature',       65, 'Named natural features'),
  ('history',      70, 'NRHP/CHL are pre-vetted; default floor'),
  ('culture',      70, 'Indigenous/anthropological sites'),
  ('architecture', 80, 'High bar: must be historically or architecturally canon'),
  ('music',        75, 'Cultural Fabric tier — already opt-in'),
  ('art',          75, 'Cultural Fabric tier'),
  ('engineering',  70, 'Bridges, dams, etc.'),
  ('food',          0, 'Floor irrelevant — only surfaces via Iconic Local Override'),
  ('other',        70, 'Default');
```

The architecture floor of 80 is the most opinionated number here. Editorial calibration: only Wikipedia-significant or AIA-canon buildings should pass. Anonymous mid-century office buildings, generic Mission Revival churches, and every NRHP-listed Methodist church in a Central Valley town do NOT pass.

These numbers are placeholders. The actual seed values are an editorial decision made by the human curator (you) after reviewing the post-import POI list. The schema exists; the values get tuned in a separate migration once data is available.

### 2.3. What this does to POI volume

Rough estimates from the existing dataset:

| Source | Total imports | After 70-floor |
|---|---|---|
| OSM | ~12,000 | ~600 (only Wikipedia/heritage-tagged) |
| Wikidata | ~5,000 | ~1,800 |
| NRHP | ~1,500 | ~1,500 (all pre-vetted) |
| CHL | ~1,200 | ~1,200 (all pre-vetted) |
| GNIS | ~3,000 | ~200 (most significant named features) |
| Narrative-extracted | ~500 | ~500 (curated by extraction process) |

**Total triggering POIs: ~5,800 pre-dedup, ~3,500–4,000 post-dedup.** Roughly an 80% reduction from the original ~20K. This is the dataset of a real tour guide who chose her stops carefully.

---

## 3. Phase 7 — Regions

This is the **soul move** → the thing that makes RoadStory feel different from any GPS-triggered POI app. POIs are points. Places are *regions*. When you crest the Tehachapi Pass and drop into the Central Valley, when you climb out of the Owens Valley over the White Mountains, when you cross from Chumash territory into Tongva territory → those transitions deserve narration.

### 3.1. Schema

```sql
CREATE TABLE regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_type text NOT NULL CHECK (region_type IN (
    'geomorphic_province',     -- USGS: Sierra Nevada, Great Valley, Mojave, etc.
    'ecoregion',                -- EPA Level III/IV: Central California Foothills, etc.
    'watershed',                -- USGS HUC8
    'indigenous_territory',     -- Native Land Digital
    'named_valley_or_basin'     -- Wikidata: Owens Valley, Carrizo Plain, Death Valley
  )),
  name text NOT NULL,
  display_name text,            -- "The Eastern Sierra" vs "Sierra Nevada Geomorphic Province"
  description text NOT NULL,    -- 200–400 word reference description used to seed narration
  polygon geography(MultiPolygon, 4326) NOT NULL,
  significance_tier smallint NOT NULL DEFAULT 50,  -- 0–100; higher = more narration-worthy
  source text NOT NULL,         -- 'usgs', 'epa', 'native_land', 'wikidata', 'editorial'
  source_id text,
  parent_region_id uuid REFERENCES regions(id),  -- ecoregions nest inside provinces, etc.
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_regions_polygon ON regions USING GIST (polygon);
CREATE INDEX idx_regions_type ON regions (region_type);
```

### 3.2. RPC

```sql
CREATE OR REPLACE FUNCTION detect_regions_at_location(
  p_lat double precision,
  p_lon double precision
)
RETURNS TABLE (
  id uuid,
  region_type text,
  name text,
  display_name text,
  description text,
  significance_tier smallint
) LANGUAGE sql STABLE AS $$
  SELECT id, region_type, name, display_name, description, significance_tier
  FROM regions
  WHERE ST_Contains(polygon::geometry, ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326))
  ORDER BY significance_tier DESC;
$$;
```

Returns all regions containing the point (a user can simultaneously be in a province, an ecoregion, a watershed, an indigenous territory, and a named valley). The WS server holds the current region set in trip state and detects entries/exits as the user moves.

### 3.3. Data sources (all free, all authoritative)

| Layer | Source | License | Approx. count in CA |
|---|---|---|---|
| Geomorphic provinces | USGS — California Geomorphic Provinces | Public domain | 11 |
| Ecoregions | EPA Level III & IV | Public domain | ~25 Level III, ~150 Level IV |
| Watersheds | USGS Watershed Boundary Dataset (HUC8) | Public domain | ~140 |
| Indigenous territories | Native Land Digital (native-land.ca) | Free API, attribution required | ~30 historical territories in CA |
| Named valleys/basins | Wikidata + manual curation for polygons | CC0 / public domain | ~50 |

All five layers ingest via importers in `scripts/region-import/`, structured similarly to the POI importers. One importer per source. Idempotent upserts.

### 3.4. Narration trigger logic

A region narration fires when the WS server detects the user has **entered a region they were not in 60 seconds ago**, subject to:

1. **First-entry-per-trip rule.** Each region narrates at most once per trip, regardless of re-entry.
2. **Rate limit.** No more than one region narration per ~20 minutes of driving. If two region transitions happen in close succession (e.g., crossing into a new province AND a new indigenous territory at the same pass), the higher significance_tier wins; the other is silently dropped.
3. **Suppression during active POI narration.** Region narrations queue, never interrupt.
4. **Mode awareness.** Region narrations are driving-mode only by default. In hiking mode, region context is delivered at trip start, not on boundary crossings (you don't want a region change to fire mid-trail when you cross an ecoregion line by 50m).
5. **Pace awareness.** Light Touch users only hear top-tier region transitions (geomorphic province + named valley); Full Drive users hear all five layers.

#### 3.4.1. Trip start inside region polygon

Trip start inside region polygon. When a trip begins with the user already inside one or more region polygons (the common case for any user opening the app from home), no region narrations fire at trip start. The app waits for sustained movement: GPS-reported speed ≥ 5 mph for ≥ 5 consecutive seconds. From the moment movement is first detected, a 30-second timer starts. When the timer expires, the highest-tier containing region fires as a region narration. On tier ties, the smallest containing polygon wins (e.g., San Fernando Valley before its containing Transverse Ranges province). Subsequent containing regions follow the existing ~20-minute rate limit between region narrations.

Composes with existing rules: first-entry-per-trip applies (the inside-region fire counts as the first entry for that region); region queue suppression during active POI narration applies as normal; driving mode only (hiking mode handles region context at trip start separately); Light Touch / Full Drive pace gating applies as normal.

### 3.5. Narration generation

Region narrations use a dedicated prompt template at `server/src/prompts/region_{audience}.ts`. The template injects:

- `region.name`, `region.display_name`, `region.description` (reference text)
- The audience mode tone (Family / Kids / Unfiltered / Local)
- The narrator's posture (the two-narrator model from §5)
- The previous region the user just exited (if any) for transition framing
- The route's overall direction (heading north into the Sierra is different from heading south out of it)

Output length is fixed at **Standard depth** (60–90 seconds) regardless of intrinsic depth weighting elsewhere. Regions need room to breathe but not 3 minutes — the user is *driving into* the region, not stopping at a single point.

**Standing order — geographical area synopses** (formalized 2026-05-21; supersedes the prior 60–90s cap for area synopses specifically). Geographical area synopses can run up to ~3 minutes (or longer if absolutely necessary). Don't force length — redundancy kills. Use full length only when the region has genuinely interesting material to land. First applied to San Fernando Valley + Los Angeles Basin (commit `29a4e88`, hand-crafted descriptions + direct-text-to-TTS regen). When the region's existing narration is a generic ecoregion / geomorphic-province description, the 60–90s baseline is the right ceiling; the standing order unlocks the longer form for regions with deep history layers that warrant it. **Scope:** this standing order applies only to area-synopsis length. Other narration types — point POI brief / standard / long per §4 — retain their existing length governance.

### 3.6. Caching

Region narrations cache forever — regions don't change. Cache key:
```
regions/{region_id}/{narrator_slug}.opus
```

Audience mode is collapsed into narrator_slug as elsewhere. With ~250 total regions in CA × 2 narrators × 4 audience modes = ~2,000 one-time generations. At Haiku-4.5 + Google TTS Chirp 3 HD pricing, this is roughly **$15–25 of one-time spend**, then free forever.

### 3.7. Backfill order

```
1. Apply schema migration for regions
2. Import USGS geomorphic provinces (11 polygons)
3. Import EPA ecoregions (Level III first, Level IV later)
4. Import Native Land Digital territories
5. Import named valleys/basins from Wikidata + manual polygons for top 30
6. Pre-generate all region narrations across both narrators and all four audience modes
7. Wire detect_regions_at_location into the WS server's trip-state loop
8. Add Light Touch / Full Drive gating for region layers
```

### 3.8. Open question — watersheds

Watersheds (HUC8) are the layer I'm least sure about. They're geographically defined but rarely top-of-mind for users. Suggest deferring HUC8 to v2 and starting with provinces + ecoregions + indigenous territories + named valleys. Decision flag for the build chat.

---

## 4. Per-POI Intrinsic Depth Weight

### 4.1. The principle

Depth is a **property of the POI**, not a property of the user. Long Valley Caldera *needs* ~3 minutes to land properly. Schat's Bakkery is done in 25 seconds. The system shouldn't try to make these the same length.

### 4.2. Schema

```sql
ALTER TABLE pois ADD COLUMN intrinsic_depth text NOT NULL DEFAULT 'standard'
  CHECK (intrinsic_depth IN ('brief', 'standard', 'long'));
```

| Weight | Target length | When applied |
|---|---|---|
| `brief` | 15–35 sec | POIs with shallow source material (single OSM tag, no Wikipedia article, NRHP-listed but minimal narrative). Most Iconic Local Override POIs. |
| `standard` | 45–90 sec | The default. NRHP + Wikipedia article + cross-source verified POIs. Most historical landmarks. |
| `long` | 2–4 min | POIs with deep source material — multiple linked Wikipedia articles, USGS bulletins, oral histories, major historical significance. Geological landmarks (Long Valley Caldera, Anza-Borrego badlands, Sierra Nevada batholith). Manzanar. The Big Sur coast as a unified narrative. |

### 4.3. How depth gets assigned

During the import pipeline, after dedup and significance recompute, a new step assigns `intrinsic_depth`:

```
- POI has Wikipedia article < 500 words AND no NRHP/CHL listing — brief
- POI has Wikipedia article 500–3,000 words OR NRHP/CHL listing — standard
- POI has Wikipedia article > 3,000 words OR multiple cross-references OR narrative-extracted source — long
- Iconic Local Override POIs — forced to brief regardless of other signals
- Geological POIs with USGS bulletin references — forced to long
```

This is a defensible heuristic, not a rule. Once we have skip-rate data (§9), the assignment gets refined per category.

### 4.4. Two cached audio lengths for `long` POIs

Each `long` POI generates **two** audio files per narrator × audience combo:

- The full version (~3 minutes) for Full Drive pace
- A compressed version (~90 seconds) for Light Touch pace

Cache key shape (extending the existing `{poi_id}/{trip_mode}/{depth}/{narrator_slug}.opus`):

```
{poi_id}/{trip_mode}/{depth}/{narrator_slug}.opus
  where depth — {'brief', 'standard', 'long', 'long_compressed'}
```

Brief and Standard POIs generate one audio each. Long POIs generate two.

### 4.5. Cost shape

Old design: 4 audience × 3 depth × 2 narrator = **24 generations per POI**.
New design: 4 audience × ~1.2 depth (most POIs at 1; only longs at 2) × 2 narrator = **~9.6 generations per POI on average**.

Roughly a **60% reduction** in generation costs vs the original. At ~4,000 triggering POIs across CA, this is real money saved (rough order of magnitude: $200–400 in initial generation, ongoing savings on all new POIs).

---

## 5. Two-Narrator Model

The original four-narrator design (Professor / Local / Junior Ranger / Truck Driver) collapses to two. Three of the four were doing work that other axes already do:

- **Professor's role** (deep dives into geo/anthro) is now handled by Soul mode + intrinsic depth weighting
- **Local's role** (highly-rated nuanced content) is now handled by Iconic Local Override + Local Color
- **Junior Ranger's role** (kid framing) is now handled by Kids audience mode

The only narrator dimension not subsumed elsewhere was **conversational tone / register** — the difference between "the land speaking" and "a friend in the cab." Two narrators capture this; four was redundant.

### 5.1. The two narrators (naming TBD)

| Working name | Posture | Tone | Voice direction |
|---|---|---|---|
| **Narrator A** (provisional names: "Window Seat" / "The Naturalist" / "Deep" / "Reverent") | Reverent, present, takes time. The land speaks first. | Thoughtful, well-paced, room for awe. Mary Hunter Austin / Robert Macfarlane / Terry Tempest Williams. | Warm authoritative, comfortable with silence between phrases, deliberate pace |
| **Narrator B** (provisional names: "Shotgun" / "The Driver" / "Easy" / "Easygoing") | Conversational, casual, relational. A friend in the cab. | Dry humor, off-the-cuff, storytelling-around-a-campfire register. | Conversational, slightly slower than average, room for "y'know" rhythm without being affected |

**Naming decision flag for the user:** the two-button test must pass. Whatever the final names, a user staring at two cards in trip setup should immediately feel the difference based on the names alone. The leading candidates remain Window Seat / Shotgun (road-trip native, paired metaphor) and Reverent / Easygoing (descriptively honest). The naming choice does not block any other implementation work — internal slugs (`narrator_a`, `narrator_b`) can ship before display names finalize.

### 5.2. Both narrators handle full depth range

Critical: **both narrators handle Brief, Standard, and Long POIs.** The Long Valley Caldera narration is ~3 minutes in either narrator — what changes is the framing, not the length. Narrator A leads with "the magma chamber beneath us is still active"; Narrator B leads with "let me tell you why this place blows my mind."

### 5.3. Narrator weight profiles

Each narrator carries a category weight profile that nudges what surfaces above the 70-floor. The weights operate as multipliers on significance_score during lookahead ranking. They do NOT change what's eligible — they change the order in dense areas and let marginal POIs (75–85 significance) tilt toward one narrator's interests.

| Category | Narrator A (reverent) | Narrator B (conversational) |
|---|---|---|
| Geology / geography | 1.4× | 1.0× |
| Anthropology / indigenous | 1.4× | 1.2× |
| History (NRHP/CHL) | 1.2× | 1.3× |
| Architecture | 1.2× | 1.0× |
| Natural features | 1.3× | 1.2× |
| Roadside / Americana | 0.7× | 1.6× |
| Local lore / quirks | 0.8× | 1.5× |
| Engineering / infrastructure | 0.9× | 1.3× |

A POI's effective significance for ranking = `significance_score × narrator_weight[category]`. POIs still must clear the 70-floor on raw `significance_score` to be eligible; the weight is a re-ranker, not a gate.

### 5.4. Local Color airtime share per narrator

When a user opts into Local Color, each narrator carries a different airtime budget for non-Soul content:

| Narrator | Soul share | Local Color share |
|---|---|---|
| Narrator A | 90% | 10% |
| Narrator B | 75% | 25% |

Soul still wins in both columns. Narrator B simply makes more room for diner culture and roadside Americana.

### 5.5. Mid-trip swap

User can change narrator mid-trip. Implementation:

1. User taps narrator chip in driving-page header — bottom sheet opens with two narrator cards
2. Select — emits `change_narrator` socket event
3. WS server invalidates the lookahead queue from current location forward
4. Re-ranks upcoming POIs with the new narrator's category weights
5. Pre-fetches the next 3–5 POIs' audio under the new narrator (cache hits if anyone's done this route before with this narrator)
6. Currently-playing narration finishes uninterrupted; next narration uses new voice

UI feedback: brief "Switching to {narrator_name}..." toast (1.5s). No interruption to in-progress audio.

### 5.6. Schema impact

The existing `voice_configs` schema already supports this — we set 2 active rows instead of 4. The `narration_audio.narrator_slug` column already keys the cache by voice. No structural migration needed beyond:

```sql
-- Deactivate the four original narrators in voice_configs
UPDATE voice_configs SET is_active = false
WHERE mode IN ('family', 'kids', 'unfiltered', 'local');

-- Insert two new narrator configs (one row per audience mode × narrator)
-- The audience mode picks the voice variant; the narrator picks the personality
-- 4 audience × 2 narrator = 8 active rows total
INSERT INTO voice_configs (mode, provider, voice_id, narrator_slug, display_name, ...) VALUES
  ('family',     'google', 'voice_a_family',     'narrator_a', 'Window Seat', ...),
  ('family',     'google', 'voice_b_family',     'narrator_b', 'Shotgun', ...),
  ('kids',       'google', 'voice_a_kids',       'narrator_a', 'Window Seat', ...),
  ('kids',       'google', 'voice_b_kids',       'narrator_b', 'Shotgun', ...),
  ('unfiltered', 'google', 'voice_a_unfiltered', 'narrator_a', 'Window Seat', ...),
  ('unfiltered', 'google', 'voice_b_unfiltered', 'narrator_b', 'Shotgun', ...),
  ('local',      'google', 'voice_a_local',      'narrator_a', 'Window Seat', ...),
  ('local',      'google', 'voice_b_local',      'narrator_b', 'Shotgun', ...);
```

The partial unique index `(mode) WHERE is_active = true` will need to be replaced with `(mode, narrator_slug) WHERE is_active = true`. One migration. Low blast radius.

---

## 6. Pace Setting

Two user-facing options, kept as a real choice (not collapsed):

### 6.1. Full Drive (default)

- POIs trigger at `significance_score >= category_floor` (default 70)
- Long-weight POIs play at full ~3-minute length
- No artificial gap between narrations
- Region transitions fire across all 5 layers
- Iconic Local Override always fires

### 6.2. Light Touch

- POIs trigger at the same floors (significance still does the gating work)
- Long-weight POIs play the compressed ~90-second version
- Minimum 6 minutes between non-iconic narrations
- Region transitions fire for top-tier layers only (province + named valley)
- Iconic Local Override always fires

### 6.3. No minimum gap rule for high-value content

A previously-considered "minimum 3-minute gap between any two narrations" is **dropped**. Replacement rule:

- A POI with `significance_score >= 75` OR Iconic Local Override status OR Region transition queue **never gets dropped due to timing**. It queues behind the active narration.
- A POI with `significance_score` in the 70–75 range gets dropped if it would land within 60 seconds of another POI ending.
- Light Touch's 6-minute floor applies only to non-iconic content (significance < 75 AND not an Iconic Local Override).

Practical result: Long Valley Caldera (3 min) can be followed immediately by Schat's Bakkery (25 sec) followed by Manzanar (90 sec). The pacing comes from the land, not from a clock.

### 6.4. UI

Trip setup shows two cards with explainer popouts:

> **Full Drive** — Hear every significant story along your route, at its full length. Best for road trips when the journey *is* the destination.

> **Light Touch** — Hear only the standout moments, compressed to keep the air clear. Best for everyday drives, family trips, or when you want flavor without commitment.

---

## 7. Cultural Fabric Bar (Music / Art / Notable Churches)

Music venues, public art, and notable churches are **opt-in via Narrative Focus + Local Color**, but with a higher bar than the rest of Local Color because the categories attract volume.

### 7.1. Inclusion criteria

A music venue / public art / notable church surfaces ONLY if it passes BOTH:

**(a) Historical bar — one of:**
- NRHP-listed
- CHL-listed
- Wikipedia article ⥠1,500 words (a meaningful article, not a stub)
- AIA architectural canon (Twenty-Five Year Award, Pritzker laureate building, etc.)

**(b) Resonance signal — one of:**
- Currently operating in original use (church-still-church, venue-still-booking)
- On the Library of Congress National Recording Registry or has a famously-recorded album from there
- Cross-source verification (≥2 of: NRHP + Wikipedia + heritage tag)
- Featured in major-publication "places that shaped American X" curation

### 7.2. Drive-by resonance score (runtime tiebreaker)

For POIs that clear the inclusion criteria but are borderline on a drive-by, a runtime resonance score adjusts trigger probability:

| Signal | Effect on resonance |
|---|---|
| Visible from the road (within 200m, line-of-sight estimable) | +20 |
| Current use matches storied use (church-still-church, venue-still-active) | +15 |
| Has its own Wikipedia article (not just listed in one) | +10 |
| Recently in cultural discourse (Wikipedia article updated in last 5 years) | +10 |
| Driving at highway speed past industrial/airport zone | -15 |
| Open-road mode, not city sightseeing | -10 for indoor venues |

The resonance score acts as a multiplier on top of significance_score for marginal POIs (75-85 range). High-significance POIs (Watts Towers, Mission Dolores, Hollywood Bowl) trigger regardless.

This runtime gate is **automatic, not user-facing**. The user sees the result → a feed where what comes up feels right → not the machinery.

---

## 8. Iconic Local Override

The override that punches through every filter to call out genuinely iconic places — the bread, the dinosaur, the motel.

### 8.1. Eligible categories

- Food & drink (restaurants, bakeries, breweries, diners, ice cream stands, BBQ joints, coffee roasters)
- Roadside oddities (Cabazon Dinosaurs, Salvation Mountain, World's Largest Thermometer, etc.)
- Americana lodging/diners with deep historical roots (Madonna Inn, Roy's Motel & Café, etc.)

### 8.2. Inclusion bar — strict, must pass ≥2 of:

For food & drink and oddities:
1. Wikipedia article exists (notability bar already cleared)
2. James Beard Foundation recognition (America's Classics, semifinalist, winner)
3. Roadfood.com directory listing (Jane & Michael Stern's curation)
4. Atlas Obscura entry (for oddities specifically)
5. Eater 38 / regional Eater Heatmap inclusion
6. OSM `start_date` ⤠1965 (longevity signal — pre-Interstate-era survivor)
7. NRHP or CHL listing (which would have pulled it in via the history pipeline anyway)

For Americana lodging/diners — must pass ≥2 of the above AND ≥1 of:
- Pre-1965 continuous operation at the same location
- Listed in Society for Commercial Archeology register or Historic Hotels of America
- NRHP or CHL listing

This second filter prevents "any 1980s motor lodge with good reviews" from claiming Americana iconic status.

### 8.3. Data sources (all free, all v1)

| Source | Cost | Coverage |
|---|---|---|
| Wikipedia articles | Free | ~automatic — already in Wikidata import |
| James Beard Foundation archive | Free (scrape, refresh annually) | ~20 CA America's Classics |
| Roadfood.com directory | Free (scrape, refresh annually) | ~200 CA entries |
| Atlas Obscura | Free API, rate-limited | ~500 CA entries |
| Eater archives | Free (scrape, refresh annually) | ~100 CA entries |
| OSM start_date | Free (already imported) | Spotty but useful |
| Society for Commercial Archeology | Free (manual scrape) | ~30 CA Americana lodging entries |
| Historic Hotels of America | Free directory | ~20 CA hotels |

**Google Places API is explicitly NOT used in v1.** Rationale: zero users, founder-funded, free sources are sufficient for the iconic-not-popular framing. Revisit Google Places integration when monthly active users > 5,000 OR when user feedback consistently flags "missed obvious place X."

### 8.4. Schema additions

```sql
ALTER TABLE pois ADD COLUMN iconic_local boolean NOT NULL DEFAULT false;
ALTER TABLE pois ADD COLUMN iconic_local_reasons text[] DEFAULT '{}';
-- Examples: ['wikipedia_article', 'roadfood_listed', 'start_date_1938', 'signature_dish:sheepherder_bread']
ALTER TABLE pois ADD COLUMN signature_hook text;
-- The one-liner: "known for sheepherder bread, a Basque sourdough"
```

### 8.5. Narration format

Iconic Local Override narrations are **forced to Brief depth** regardless of trip Pace or intrinsic POI depth. Target ~30-second callout:

> *"Up on the left, that's Schat's Bakkery — Erick Schat opened it in 1938, and they're known for their sheepherder bread, a sourdough recipe the Basque shepherds brought to the Owens Valley. The line out the door on a Saturday morning is half the experience."*

The narration prompt template `iconic_local_callout.ts` takes `(poi.name, poi.signature_hook, poi.iconic_local_reasons)` and generates the punch.

### 8.6. Trigger rules

- Always fires regardless of narrative_focus (Soul, +Local Color, Custom)
- Always fires regardless of pace (Full Drive, Light Touch)
- Never interrupts active narration — queues behind it
- Max one Iconic Local per ~30 min of driving (if two iconic POIs are close together, the higher-scoring one wins; the other is suppressed)
- Bypasses the 60-second post-narration gap rule

### 8.7. Importer pipeline

A new importer `scripts/poi-import/sources/iconic-curation.ts` scrapes the curated lists, cross-references against the existing pois table by name + location proximity, and sets `iconic_local = true` plus the `iconic_local_reasons` array. Runs as a separate pipeline phase after all other importers and dedup.

---

## 9. Skip / Tell Me More + Feedback Reports

### 9.1. UI controls

**Skip button:** appears on the active narration card (bottom card on driving page). Tap — audio fades out over ~800ms, current narration logs as `skipped_at_second: N`, next queued narration plays.

**Tell Me More pill:** after a Brief or Standard narration ends, a "Tell me more —" pill appears on the card for ~6 seconds. Tap — system plays the Long version of the same POI (regenerating on demand if not cached, which is rare for high-significance POIs).

Both controls are visible during driving mode (placement TBD by UI design — must respect the safety-first rule of large targets, no reading).

### 9.2. Schema

```sql
CREATE TABLE narration_plays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  trip_id uuid REFERENCES trips(id),
  poi_id uuid REFERENCES pois(id),
  region_id uuid REFERENCES regions(id),  -- nullable; one of poi_id or region_id is set
  narration_audio_id uuid REFERENCES narration_audio(id),
  played_at timestamptz NOT NULL DEFAULT now(),
  audio_duration_ms integer NOT NULL,
  played_through_ms integer NOT NULL,  -- 0 if user skipped immediately
  was_skipped boolean NOT NULL DEFAULT false,
  skipped_at_second integer,
  tell_me_more_tapped boolean NOT NULL DEFAULT false,
  CHECK (poi_id IS NOT NULL OR region_id IS NOT NULL)
);

CREATE INDEX idx_narration_plays_poi ON narration_plays (poi_id);
CREATE INDEX idx_narration_plays_user ON narration_plays (user_id);
CREATE INDEX idx_narration_plays_played_at ON narration_plays (played_at);
```

### 9.3. Three reports

**Report 1: Per-narration health (weekly cron)**

For every narration with ≥20 plays:
- Median played-through percentage
- Skip rate (% of plays that ended early)
- Skip clustering (where in the audio do skips happen — first 10 sec? 2-min mark?)
- Tell-Me-More tap rate (for Brief/Standard narrations)

Action: any narration with skip_rate > 40% OR median_played_through < 50% gets flagged for regeneration. Flagged narrations enter `narration_regen_queue`. The narration worker picks them up, regenerates with a varied prompt, and A/B tests against the original over the next 100 plays. Winner stays, loser is archived.

**Report 2: Per-user nudges (real-time)**

For users with ≥20 plays:
- Skip rate > 50% across all narrations — nudge: *"Looks like our narrations might be running long for you. Want to try Light Touch?"*
- Skip rate > 40% on a specific category — quiet category weight adjustment for that user (opt-in via "Learn from my taps" setting)
- Skip rate < 10% AND Tell Me More tap rate > 30% — nudge: *"You're enjoying the deep cuts. Want to switch to Full Drive?"*

Nudges are one-shot, never twice in a row, dismissible.

**Report 3: Content-quality dashboard (monthly, human-curated)**

For the human curator (founder):
- Top 50 narrations by skip rate
- Top 50 narrations by Tell Me More tap rate (signals under-served depth)
- Categories with rising / falling engagement over the last 30 days
- New POIs added in the last 30 days with their initial skip rates

This is the editorial dashboard. Pattern-spotting that humans do better than crons.

### 9.4. Privacy

Skip data is scoped to authenticated users only. Anonymous users don't generate narration_plays rows. The "learn from my taps" auto-tuning is opt-in (default off) per the user's earlier privacy preference. Aggregated skip statistics for content quality are non-identifying.

---

## 10. Putting It All Together — The Lookahead Queue

The lookahead worker on the WS server runs every 5 seconds during driving mode. It produces an ordered queue of upcoming narrations. The full ranking pipeline:

```
1. Get user's current location, speed, heading, route geometry
2. Query candidate sources:
   a. detect_regions_at_location — any new regions entered in last 60 sec
   b. get_route_pois(route_geom, corridor_m=lookahead_radius) —
      all POIs ahead, filtered by:
      - merged_into IS NULL
      - significance_score >= category_significance_floors[category]
      - parent_poi_id IS NULL (drive-by mode; venue tour uses different RPC)
      - category in narrative_focus allowed categories (default Soul + Iconic Local)
   c. iconic_local override check for any POI ahead within corridor regardless of focus

3. Rank candidates:
   - effective_score = significance_score × narrator_weight[category]
   - For Cultural Fabric POIs: apply resonance score modifier
   - Iconic Local: forced to top of queue, max 1 per 30 min
   - Region transitions: forced to top of queue, max 1 per 20 min, top-tier only for Light Touch

4. Apply Pace rules:
   - Full Drive: queue everything that passes ranking, no gap floor
   - Light Touch:
     - non-iconic POIs need ⥠6 min gap from previous narration
     - long-weight POIs use long_compressed audio variant

5. Drop any POI within 60 sec of another POI's end time IF significance_score < 75

6. Pre-fetch audio for next 3-5 queued items using current narrator + audience + intrinsic_depth (or long_compressed for long+Light Touch)
   - Cache hit — URL ready
   - Cache miss — enqueue generation job, expect ~5-8 sec latency

7. Emit narration_queued events to client for UI preview
```

### 10.1. Mode override

When the user is on the Hiking page, swap step 2b for the hiking RPC variant (80m proximity, walking speed). When on the City Sightseeing page, the auto-queue is disabled entirely (tap-to-hear). Regions are driving-only by default.

### 10.2. Cancel-route invalidates queue

Standard behavior. Already in spec.

### 10.3. Mode-dependent significance and density-aware ranking

**Principle:** significance is mode-aware. The same POI has different signal value depending on trip mode and the density of surrounding catalog. The curator approves a POI for the catalog as a single binary decision (`editorial_curated = TRUE`); the runtime decides per-mode whether to surface, narrate, or suppress based on local context.

**Canonical illustration — the green church.** A small green-painted historic church on US-395 in eastern Sierra ranchland is **prime drive-by material**: 30 miles of empty highway makes it a meaningful inflection point in the trip, and the listener has the attention budget for a 90-second narration about it. The same listener walking through downtown LA past 15 historic churches in a six-block radius does **not** want an auto-narration for every one of them — but does want them on the map as **radar dots they can tap when one catches their eye**. Same POI, same significance score, fundamentally different surfacing behavior. This is the load-bearing example for everything in this section.

**Per-mode policy:**

- **Walking / Hiking mode.** Density is a feature. The 80m proximity trigger radius (§10.1 hiking override) and walking pace (≤4 mph) naturally bound the trigger set — even in a dense district, only POIs the listener is physically walking past get queued. **All approved POIs in scope; no cluster suppression.**

- **City Sightseeing mode.** Auto-queue is disabled (§10.1); the user taps a radar dot to hear about a POI. The user controls density by choosing what to tap. **All approved POIs in scope, surfaced as radar dots; no cluster suppression.**

- **Driving mode.** Needs cluster-aware ranking. When **N ≥ 3 same-category approved POIs** fall within **5 corridor-miles** of each other along the route, only the **top-of-cluster** entry (highest `significance_score + editorial_score_boost`) surfaces for that trip. Suppressed POIs **remain in the catalog** and surface normally in Walking/Hiking and City Sightseeing modes.

**Defaults (curator-tunable):**

| Param | Default | Notes |
|---|---:|---|
| `cluster_min_count` | 3 | Minimum same-category POIs to trigger suppression |
| `cluster_radius_corridor_mi` | 5 | Corridor-distance window |
| `cluster_top_n_kept` | 1 | How many top-of-cluster entries survive (curator may set 2 for very dense urban segments) |

**Curation implication.** Approve liberally for the catalog. **Do not** withhold approval on a POI because it might be redundant in some mode — the runtime handles mode-specific suppression. Editorial-gate decisions are about per-POI quality, not per-mode appropriateness. A `[+]` boost on a POI in a dense cluster correctly elevates it as top-of-cluster in driving mode and as a higher-ranked radar dot in city mode; the underlying catalog state is the same.

**Implementation status — v1.5 / Phase I, not v1-blocking.** The cluster-suppression pass lands in the lookahead worker (per §10 step 2b/3) and is captured in CLAUDE.md "Open architectural concerns" as a v1 lookahead requirement. v1 ships without suppression — the curator's editorial-gate decisions (`editorial_curated = TRUE` set) provide adequate first-cut filtering for the launch slate (189 POIs across California is sparse enough that driving-mode density rarely fires). The rule is captured here so curation behavior aligns with future runtime behavior from day one.

---

## 11. Migration Order

When the build chat picks this up, the migrations should run in this order. Each step is incremental and ships independently.

1. **Migration: add `intrinsic_depth` to `pois`** (§4.2) — backfill all existing POIs to 'standard'; the depth-assignment job runs after
2. **Migration: add `iconic_local` columns to `pois`** (§8.4)
3. **Migration: create `category_significance_floors` table** (§2.2)
4. **Migration: create `regions` table** (§3.1) + RPC `detect_regions_at_location`
5. **Migration: create `narration_plays` table** (§9.2)
6. **Migration: update `voice_configs` partial unique index** to `(mode, narrator_slug) WHERE is_active = true` (§5.6); deactivate old narrators; insert two new narrators × four audience modes
7. **Update `get_nearby_pois` and `get_route_pois` RPCs** to accept `narrative_focus`, `pace`, and `narrator_slug` parameters and apply per-category floor logic
8. **Import region data** (USGS provinces → EPA ecoregions → Native Land Digital → named valleys)
9. **Pre-generate region narrations** (~2,000 generations, one-time ~$15-25)
10. **Import iconic curation sources** (Wikipedia + Roadfood + James Beard + Atlas Obscura + Eater + SCA + HHA)
11. **Run depth-assignment job** to set `intrinsic_depth` per heuristics in §4.3
12. **Update lookahead worker** with the full ranking pipeline (§10)
13. **Update mobile UI:**
    - Trip setup: narrator picker (2 cards), narrative focus picker (3 cards), pace picker (2 cards)
    - Driving page: Skip button + Tell Me More pill
    - Settings: "Learn from my taps" toggle
14. **Wire skip/tell-me-more events** through WS to `narration_plays`
15. **Ship report cron jobs** (per-narration health, per-user nudges, content dashboard)

Each migration is reversible. Each step can be deployed independently and the system remains functional throughout (with the old behavior progressively replaced).

---

## 12. Open Questions / Decision Flags

The build chat should flag these back for human decision when relevant:

1. **Final narrator names.** Internal slugs (`narrator_a`, `narrator_b`) can ship in code now; display names can be set in `voice_configs.display_name` once finalized. Does not block any work.
2. **Watersheds (HUC8) in v1 or deferred to v2?** Recommend deferred.
3. **Per-category significance floors final values.** Schema is in place; human curator (you) reviews the post-import POI list and sets values.
4. **Resonance score weights** (§7.2) — initial values are heuristic; tune based on early Cultural Fabric skip rates.
5. **Local Color airtime ratios per narrator** (§5.4) — initial values are guesses; tune based on user feedback.
6. **Tell Me More cache-on-demand cost** — if Long-version audio doesn't exist when user taps the pill, generation latency is 5–10 sec. Acceptable UX or pre-generate Long versions for all `significance_score >= 80` POIs at import time? Recommend the latter; ~$50 one-time cost for CA.

---

## 13. What This Doc Does NOT Cover

- Venue Tour mode interactions with these changes (see `venue-tour-design.md`; Venue Tour POIs bypass most of this addendum's logic by design — venue children have their own significance pool and trigger logic)
- Corridor narration (the existing prompt-engineering for gap-filling between POIs is unchanged)
- Group trip / shared narration synchronization (no changes needed; group narrator selection follows the lead user's pick)
- The voice audition workflow (unchanged; covered in SKILL.md)
- Monetization tier gating (TBD — likely the Free tier gets Soul-only Light Touch with Narrator A; Road Pass unlocks all of the above)
- **Conversational Query Mode** (v1.5, captured in [docs/decisions/2026-05-18-conversational-query-mode.md](decisions/2026-05-18-conversational-query-mode.md)). This addendum covers the **push** narration model — unsolicited audio triggered by GPS, region transitions, iconic-local overrides, and the lookahead queue. The query mode is a parallel **pull** model — STT-activated user questions ("hungry, anything good around here?"), same brain answering with current trip context. The push and pull models share the catalog, voice config, and SSML pipeline but are distinct interaction paradigms. v1 ships push-only; v1.5 layers pull on top.

---

---

## 14. v1.1 Amendments (post-lock refinements)

The §0–§13 sections above are the locked v1.0 design dated this addendum's original lock. The sections below capture post-lock refinements — curator decisions, implementation drift, and design extensions that landed after v1.0 was committed. **The v1.0 sections are preserved unmodified as historical record**; this section is the running update.

### 14.1. §11 migration plan — current status

The original §11 listed 15 numbered steps. Status as of 2026-05-20:

| Step | Description | Status |
|---|---|---|
| 1 | `pois.intrinsic_depth` column + default 'standard' | ✓ DONE (migration `20260514000002`) |
| 2 | `pois.iconic_local`, `iconic_local_reasons`, `signature_hook` columns | ✓ DONE (migration `20260514000003`); flag still at 0 rows pending Phase F importer |
| 3 | `category_significance_floors` lookup table | ✓ DONE (migration `20260514000004` schema; seed at `20260518000002` B1; full curator-tuned seed at `20260519000003` G2) |
| 4 | `regions` table + spatial index | ✓ DONE (migration `20260514000005` + follow-ups) |
| 5 | `narration_plays` table | ✓ DONE (migration `20260514000006` schema); event wiring NOT done (Phase K) |
| 6 | `voice_configs` partial unique index swap | ✓ DONE (migration `20260514000012` + `20260518000001` D3 lockdown); only narrator_b active for Family/Local currently |
| 7 | Update `get_nearby_pois` / `get_route_pois` (actually `get_corridor_pois`) RPCs | ✓ DONE — landed via G2 (`c5d0a1e`, migration `20260519000004`) for the floor + tier work; C1 (`d7a78aa`, migration `20260520000001`) for the spatial curator-bypass. `narrative_focus` and `pace` RPC params NOT wired — superseded in practice by server-side floor + spatial enforcement (the per-category floor + curator bypass make the per-call param wiring less load-bearing) |
| 8 | Import region data | ✓ DONE for USGS provinces, EPA ecoregions, named valleys (51 regions). NLD indigenous territories deferred to v2 per [docs/decisions/2026-05-14-nld-deferral.md](decisions/2026-05-14-nld-deferral.md). Watersheds (HUC8) deferred to v2 |
| 9 | Pre-generate region narrations | ◐ PARTIAL — 108 generated (54 regions × narrator_b × Family/Local). Other audience × narrator combos await Phase H expansion |
| 10 | Import iconic curation sources | ○ NOT STARTED (Phase F) |
| 11 | Depth-assignment job | ✓ DONE (`scripts/poi-import/assign-intrinsic-depth.ts`, 2026-05-19). All 21,935 active POIs assigned: brief 5,057 / standard 16,612 / long 266 |
| 12 | Update lookahead worker with full ranking pipeline | ◐ PARTIAL — Block I.1 + I.2 MVP done as offline simulator (`scripts/simulate-trip/`, commit `ab33921`). I.3 production wiring NOT started |
| 13 | Update mobile UI (trip setup pickers + driving page + settings) | ◐ PARTIAL — Trip Setup pickers landed via J1a (`54eea84`) + J1a-followups (`f2fbe51`). Driving page Skip + Tell Me More NOT done (gated on Phase I.3). Settings NEW BUILD queued (J4) |
| 14 | Wire skip/tell-me-more events | ○ NOT STARTED (Phase K) |
| 15 | Ship report cron jobs | ○ NOT STARTED (Phase K) |

### 14.2. Per-category significance floors — curator-tuned seed (G2, commit `c5d0a1e`)

§2.2 listed placeholder values. The curator-tuned final seed (migration `20260519000003`, applied live 2026-05-20):

| Category | Floor | Notes |
|---|---:|---|
| geology | 60 | Smaller corpus; surface peaks 60–69 (Junipero Serra Peak, Cerro San Luis Obispo, Cone Peak) |
| nature | 65 | Geography surface; surface top features 65–69 |
| history | 70 | Addendum §2.1 baseline; explicit anchor for `native_history` sub |
| local_culture | 70 | Covers music venues + public art + heritage culture (Customize's "Music" / "Roadside" labels both map here) |
| **architecture** | **90** | **Curator-bumped from §2.2's placeholder 80** — California has ~1,650 NRHP-listed architecture POIs with scores 60–89 (anonymous 19th-century Methodist churches, mid-century office buildings) that the addendum's 80 floor wouldn't reject. The 90 floor pushes the burden of sub-90 architecture surfacing onto `editorial_curated` |
| art | 75 | Between local_culture (70) and architecture (90) |
| food_drink | 0 | Floor disabled; surfaces only via iconic_local override per §1.1 / §8 |
| engineering | 70 | Addendum baseline; bridges/dams/mining subs mirror |
| viewpoint | 65 | Scenic viewpoints at slightly reduced floor — between nature's 65 and history's 70 |
| hidden_gems | 70 | COALESCE-default value; row present for explicitness |
| recreation | 70 | COALESCE-default value; row present for explicitness |
| volcanic | 60 | geology sub; mirrors parent |
| hot_springs | 60 | geology sub; mirrors parent |
| native_history | 70 | history sub; mirrors parent |
| bridges | 70 | engineering sub; mirrors parent |
| dams | 70 | engineering sub; mirrors parent |
| mining | 70 | engineering sub; mirrors parent |

Only `legends` falls through to the COALESCE-70 default. Total: 17 explicit rows + 1 implicit.

**Server-side enforcement** — the §2 floor was previously enforced nowhere in live runtime; only in the offline simulator (`scripts/simulate-trip/`) and curation export (`scripts/curation/export.ts`). G2 (`c5d0a1e`) closed that gap. Both `get_corridor_pois` and `get_nearby_pois` now JOIN `category_significance_floors` and enforce floors via `GREATEST(COALESCE(csf.significance_floor, 70), min_significance)`. The existing `min_significance` RPC param remains; semantic shifts from "the only floor" to "an additional floor on top of the per-category floor."

**Bypass paths** (the OR-chain in the WHERE clause):
- `editorial_curated = TRUE` — curator-approved POI surfaces regardless of significance_score
- `iconic_local = TRUE` — strict-iconic-bar POI surfaces regardless of significance_score

The two bypass flags also drive a new `priority_tier text` column in the RPC RETURNS shape (`'curator'` / `'iconic'` / `'standard'`); ORDER BY promotes by tier first, then `significance_score DESC`, then the existing spatial sort.

### 14.3. Curator-override philosophy extended to spatial (C1, commit `d7a78aa`)

The G2 bypass was significance-tier only. C1 extends the same "curator override on user controls" philosophy to the spatial filter:

- `editorial_curated = TRUE` and `iconic_local = TRUE` POIs now bypass the user-set corridor distance (`corridor_width_miles` for route queries, `radius_m` for point queries)
- **Cap: 25mi visibility horizon** — hardcoded as `25 * 1609.34` m (≈40,233.5 m) inline at both RPC sites
- Standard tier remains bound by the user-set value

**25mi cap rationale** — curator's heuristic: past ~25mi, atmospheric haze hides most landmarks unless at altitude with clear sightlines. The cap is the curator's visibility horizon, not the user's slider. Tested via Mt Whitney exclusion at 25.02mi (32m past cap) on the LA→Mammoth straight-line route — Whitney would surface on actual US-395 routes through Lone Pine but is correctly excluded on the LA-downtown→Mammoth-centroid synthetic.

**Composition with C2 Reach control** — the Drive page Reach slider (Nearby 5mi / Within sight 10mi / Geographical area 20mi, C2 commit `e7200e8`) operates on the standard tier. Curator/iconic POIs surface independently up to 25mi regardless of Reach setting. The two controls compose orthogonally.

### 14.4. Pace → Detail rename (J1a-followups, commit `f2fbe51`)

§1.2 and §6 of the locked v1.0 design name the user control "Pace" (Full Drive / Light Touch). Per the curator's Expo walk-through after J1a (`54eea84`), the axis was renamed to **"Detail"** in J1a-followups (`f2fbe51`).

- Type alias `Pace` → `Detail` in `src/store/tripStore.ts`
- Field `pace` → `detail`
- Setter `setPace` → `setDetail`
- Zustand persist version bumped 2 → 3 with a migrate() step renaming the persisted key
- Filters JSON nav-param key renamed from `pace` to `detail`
- Option identifiers (`full_drive` / `light_touch`) unchanged — only the conceptual axis name changes

Rationale: "Pace" implied speed of audio delivery; the actual axis controls **story length per POI** (full-length vs Light Touch compressed). "Detail" describes the dimension more directly. §1.2 / §6 of the v1.0 design are preserved unchanged as historical record.

### 14.5. Drive page Reach control (C2, commit `e7200e8`)

Replaces the pre-C2 free-slider "Story corridor" control on drive.tsx with a 3-snap-stop control.

| Snap | Mile value | Semantic |
|---|---:|---|
| Nearby | 5 | Direct-route landmarks, immediate roadside |
| Within sight | 10 | Clearly visible peaks, distinct geological features |
| Geographical area | 20 | Region-defining features, distant ranges |

- Section label: **REACH** (single-word evocative; matches the eyebrow visual pattern of customize.tsx's DETAIL / NARRATIVE FOCUS)
- **Defaults to Geographical area (max)** — opt-out UX consistency with the queued category-pills-all-lit default
- Reuses the existing `SegmentedTrio` primitive (no new component)
- `filters.corridorMi` from customize's nav-params is intentionally ignored; drive starts at max regardless

Composes with C1: a curator POI at 22mi off-route surfaces even at "Nearby" (5mi) — the user's Reach pick affects the standard tier; curator/iconic punch through to 25mi.

### 14.6. Stat strip "PACE" → "STORIES PER" (C0, commit `7549676`)

The TripStat strip column header on customize.tsx was a frequency metric ("1 narration per N minutes") labeled "PACE" — a leftover from before the J1a-followups Pace→Detail rename. After the rename, "PACE" collided with the absent-but-now-renamed Detail axis. C0 renames the column header to **"STORIES PER"** — describes the value directly. Value formatter and underlying computation unchanged.

### 14.7. Sliders removed from Trip Setup (J1a-followups, commit `f2fbe51`)

Three controls removed from customize.tsx per the curator's Expo walk-through:

- Density `SegmentedTrio` (Sparse / Balanced / Dense)
- Min Relevance `LabeledSlider` (0–100)
- POI Distance `LabeledSlider` (= Trip Setup corridor; drive-page corridor slider was C2 e7200e8)

CHECK-constrained columns (`trips.density`, `trips.min_relevance`) are hardcoded in saveTrip with inline comments matching the J1a `depth: 'ride_along'` pattern. `trips.poi_distance_m` has no CHECK and was dropped from the payload entirely (DB DEFAULT 500 applies).

**Conceptual replacements:**
- Density picker → **Block I.3.3 adaptive corridor** (server-side, automatic, context-aware spatial density)
- Min Relevance → **G2 per-category floors** (server-side, automatic, per-category)
- POI Distance → **C2 Reach control on drive.tsx** (3 snap stops on the runtime screen, not trip-setup)

Plus the upstream chain: customize still emits density / minRelevance / corridorMi in the filters JSON nav-param with mode-aware defaults for backward-compat with drive.tsx's safe-fallback reads (`?? 'balanced'` / `?? 0` / `?? 1`). The home → customize → drive curation chain stays consistent.

### 14.8. Open Questions status (§12 update)

| # | Original question | Status |
|---|---|---|
| 1 | Final narrator names | Still open — internal slugs `narrator_a` / `narrator_b` shipped without display-name resolution |
| 2 | Watersheds (HUC8) in v1 vs v2 | Resolved — deferred to v2 |
| 3 | Per-category significance floor values | **Resolved** — see §14.2 above for the G2 curator-tuned final seed |
| 4 | Resonance score weights | Still open — gated on Cultural Fabric skip data |
| 5 | Local Color airtime ratios | Still open — gated on user feedback |
| 6 | Tell Me More pre-gen | Still open — gated on Phase K skip/tell-me-more event wiring |

### 14.9. Companion docs

For sequencing across all pending work, see `roadstory-unified-roadmap.md` — specifically the Phase Status block + Post-catalog-v1 commit stack table at the top of §4.

For implementation details + drift log, see `CLAUDE.md` — has running per-commit paragraphs in the migration log.

---

## 15. Mode Bifurcation — Soul vs Local as Parallel Paradigms

**Status:** Open architectural direction (raised 2026-05-20). Supersedes the additive "+Local Color" framing in §1.x for v1.1+ thinking. Not in scope for v1 launch — v1 ships Soul-only with "+Local Color" remaining as a loose seed.

### 15.1. The shift

Soul and Local are two distinct modes the user toggles between in real time. Not a base-plus-overlay; a context switch between two parallel paradigms.

- **Soul mode (the land speaks):** geology, volcanism, rivers, seas, mountains, indigenous history, deep historical context. The contemplative voice. Default for open-road driving.
- **Local mode:** utility + discovery. Great restaurants, attractions, museums, theme parks, distinctive local places. The wayfinder voice. What you flip into when you enter a town.

### 15.2. The on-the-fly toggle

User toggles between modes mid-trip without restarting. Drive the 395 → Soul. Pull into Bishop for dinner → Local. Back on the 395 → Soul. Toggle lives on the drive page, easy thumb-reach.

When the toggle fires: active narration finishes uninterrupted; POI lookup switches by category routing; next narration uses the active mode's prompt template and voice; map markers shift to reflect the active mode's POI set.

### 15.3. Catalog routing (no new data source)

Same curated catalog, sliced by category. No external API integration, no new POI source. Each `category_slug` is tagged for which mode(s) it surfaces in:

- **Soul-only categories:** history, nature, geology, indigenous_culture, plus the gap categories (engineering, viewpoint, recreation, volcanic, hot_springs, native_history, bridges, dams, mining, legends).
- **Local-only categories:** food_drink, theme_park, local_culture (music + roadside), and the Local-leaning portion of architecture.
- **Architecture is the edge case** — historic landmarks (missions, NRHP buildings, civic landmarks) belong to Soul; museums and notable contemporary architecture belong to Local. May need a sub-tag or per-row routing rather than category-level.

Categories not yet in the catalog (gas, lodging, services) are explicit non-goals for v1.1 Local — separate scope if/when added later.

### 15.4. Category model on the chip rail

The chip rail splits per active mode:

- **Soul-mode chips:** history, geology, nature, indigenous_culture, etc.
- **Local-mode chips:** food, attractions, theme_parks, local_culture (rebrandable per chip rail UX).

Per-mode defaults: Soul defaults to all-chips-on (current behavior). Local defaults TBD — possibly all-on for consistency, possibly food-only-on with the rest opt-in.

### 15.5. Narration generation (Local mode is single-variant, three registers)

Soul mode keeps the existing matrix (4 audience × 2 narrator × ~1.2 depth ≈ 9.6 generations per POI).

Local mode is single-variant on the technical axes: one voice (narrator_b's casual register — the existing "local casual voice"), one audience (no per-audience variants for Local), one depth (standard). One generation per Local POI. But the prompt template has three registers depending on tier and brand:

- **Gold tier (iconic_local / editorial_curated):** full destination-tier narration. The "this is THE place" voice — history, what makes it singular, why it's worth stopping. Cole's gets the French dip story; Schat's gets the Bishop bakery history.
- **Emerald non-chain:** medium narration. A sentence or two of context — what it is, why it's worth knowing about. The solid local place that isn't iconic.
- **Emerald chain (brand field present):** utility-brief. "Denny's, half a mile up on the right." Identification only, no history. Same narrator voice, much shorter generation.

Cache key adds a `narrative_mode` dimension: `{poi_id}/{trip_mode}/{narrative_mode}/{audience}/{narrator_slug}/{depth}.opus`. For Local rows, audience/narrator/depth collapse to fixed values; only `poi_id` and `narrative_mode` actually vary.

Disambiguation: `trip_mode` (driving/hiking/venue_tour) is orthogonal to `narrative_mode` (soul/local). Different concerns, both needed in the key.

### 15.6. Surfacing logic per mode (significance + override + brand-aware spatial dedup)

Soul mode keeps the locked-in 70 floor + per-category Soul-side floors + override paths via `editorial_curated` / `iconic_local` (§2).

**Local mode uses significance + override on the existing fields, with brand-aware spatial dedup layered on top.** The existing `significance_score` is the rating signal; `iconic_local` / `editorial_curated` flag the destination tier. No external rating API needed — the database does the work.

Tier mapping uses the existing visual system:

- `iconic_local` OR `editorial_curated` → **gold X marker** (top-tier Local — destination places). Never applied to chain locations.
- Standard tier above per-category Local floor → **emerald X marker** (popular/decent Local, including chains when surfaced)
- Below floor → doesn't surface

Per-category Local floors land lower than Soul's 70. For food_drink specifically, a floor around 25–30 filters truly zero-signal rows (Joyce's at 0) while letting reasonable rows surface in sparse areas. The food_drink `iconic_local` curation pass flags Cole's / Phillippe / Musso & Frank / Schat's / Tadich / etc. for gold-tier surfacing.

The parked food_drink `iconic_local` curation pass is the foundational Local-mode curation step — without it, Local food surfacing is emerald-only with no destination-tier highlights.

**Chain restaurants are not excluded — they're spatially deduped.** A single chain location in a sparse area where it's the only food option should surface as emerald. Three chain-siblings clustered in a dense area should not all paint the map.

Mechanism: when a `brand` field is present on a POI (sourced from OSM `brand=*` tag during import), Local-mode queries cap surfacing to 1 location per brand within a spatial radius (proposed: ~5 miles). Outside the radius, the chain surfaces independently. Implications:

- Single Denny's in a small 395 town: surfaces as emerald (no brand-siblings within radius)
- Three McDonald's clustered in dense sprawl: nearest-1 (or highest-significance-1) surfaces, others suppressed
- Chain locations never get gold — `iconic_local` / `editorial_curated` flags are not applied to chain rows by curation discipline
- Per-category floor still applies; very low-significance chain rows below floor still don't surface at all

Narration for surfaced chains uses the emerald-chain register from §15.5 — utility-brief, no historical depth.

### 15.7. Audience-mode naming collision

The audience-mode set is currently `family | kids | unfiltered | local`. The `local` audience name will collide with Local *narrative mode* once bifurcation lands. Rename before bifurcation work: candidates `insider`, `native`, `resident`. Pick one and refactor cleanly in advance.

### 15.8. Monetization

Local mode as a paid feature is the intended business model. Soul mode is the free/base tier — complete and valuable on its own, the soul of the product. Local mode is the premium layer that turns the app from contemplative companion into wayfinder.

Pricing model TBD; possible shapes:

- Monthly subscription unlocks Local mode globally
- One-time purchase for permanent Local-mode access
- Free trial of Local mode for the first N trips, then conversion prompt

Mode toggle becomes a conversion moment for free-tier users. Critical design constraint: the prompt must not feel punitive. Soul mode by itself has to feel like a complete, satisfying product — not a deliberately crippled free tier. Users who never upgrade should feel they got something whole.

### 15.9. v1 vs v1.1+ disposition

**v1 launch (current):** Soul mode is what ships. The "+Local Color" opt-in stays as it is (additive narrative flavor) — a partial seed of the eventual Local mode but explicitly not the locked design.

**v1.1+ scope (this section):** the bifurcation needs, in rough order:

1. Audience-mode rename (`local` → `insider` / etc.) to free up the name
2. Category-to-mode routing tags (slug-level for most, per-row for architecture)
3. Food_drink `iconic_local` curation pass (foundational Local catalog seed) — **first concrete application of the §15.10 Editorial Gate framework**, not a stand-alone concern. The Editorial Gate generalizes the discipline (`editorial_curated` as Soul-access control across all categories); the food_drink floor=999 sentinel (commit `8b49c80`) is the per-category precursor pattern; the food_drink curation pass is what fills Bucket C-promoted content for the category specifically.
4. Local prompt templates — three registers (gold destination tier / emerald non-chain medium / emerald chain utility-brief)
5. Local-mode chip rail variant
6. In-trip mode toggle UI on the drive page
7. Local-mode significance floors / per-category surfacing gate tuning
8. Brand field import (OSM `brand=*` tag) + brand-aware spatial dedup query rule (1-per-brand within ~5mi)
9. Cache key extension for `narrative_mode`
10. Monetization wiring (subscription / IAP) tied to the toggle
11. "+Local Color" deprecation disposition once Local mode is live

This is a v1.1+ scope shift. Not for launch.

### 15.10. The Editorial Gate

**Default routing principle:** POIs default to `narrative_modes = {local}`. Soul access is earned by curated editorial content. The catalog's structural posture is wayfinder-by-default; the contemplative voice unlocks per row as the curator writes about it.

**Three-bucket framework:**

- **Bucket A (Always Soul-only):** landform, geological, and contemplative-historical categories where the Local-mode wayfinder voice doesn't fit. The editorial flag does NOT promote these to Local — a curated geological landform is a deeper Soul anchor, not a tourist destination.
- **Bucket B (Always Local-only):** wayfinder destinations with no Soul angle even when there's content — theme parks and their ride children, National Park children (parent NP carries Soul; sub-features don't double-fire the contemplative voice), museum-complex children (parent venue carries Soul). The editorial flag does NOT promote these to Soul.
- **Bucket C (Editorial-gated):** default `{local}`. Promotes to `{soul,local}` when `editorial_curated = TRUE`. Applies to most categories — the editorial flag is the gate that unlocks the contemplative voice on rows the curator has invested in.

**Implementation.** A `BEFORE INSERT OR UPDATE` trigger on `pois` (the `pois_narrative_modes_recompute` trigger, fires on changes to `editorial_curated`, `parent_poi_id`, `source_type`, `category_id`, `significance_score`, `is_venue`, `venue_type`, or `narrative_modes_override`) calls `public.recompute_narrative_modes(row)` and sets `narrative_modes` per the three-bucket framework. As editorial content is written, rows automatically promote to `{soul,local}` without re-running migrations. A `narrative_modes_override` boolean (default FALSE) lets the curator lock individual rows to manual values that survive future trigger fires — used today for two OSM-sourced Manzanar-class historic sites that fall through Bucket A's `source_type = 'editorial'` predicate.

**Generalization of the food_drink mechanism.** The Editorial Gate extends the food_drink override-only surfacing pattern (floor `999` sentinel, commit `8b49c80`) to all categories. Where food_drink uses the per-category significance floor as the gate, the framework here uses `editorial_curated` directly — the same "curator earns the surface, not the algorithm" principle applied at the routing layer rather than the floor layer. food_drink's `iconic_local` curation pass (§15.9 step 3) is the foundational seed of Bucket C-promoted content for that category; the gate generalizes the discipline across the catalog.

**Two types of editorial content** (forward-looking, v1.1+ scope; not implemented in the initial Layer 3 migration):

- **Subject-direct editorial:** the editorial is about the POI itself. Soul-mode narration anchors on the POI's own story — its architecture, its history, what makes it singular. The curator wrote the row's editorial because the row is the subject.
- **Locality-anchored editorial:** the editorial is about a regional story that *happened near* the POI. The POI serves as a geographic trigger anchor, not the subject. Composes with the region narration layer (§3) and opens up "stories that happened here" content where the POI is convenient location rather than marquee subject — e.g., a sequence of locations along the route triggers a narration about the Vásquez stagecoach robberies that happened in the area, where each location's role is to be in the right place rather than to be the story's protagonist. Data model implications (separate `editorials` table; many-to-many anchoring between editorials and POIs; an `editorial_role` column on the join indicating subject-direct vs. locality-anchored; routing logic for which editorial fires when multiple anchor a single POI trigger) deferred to v1.1+.

**Connection to §15.9 sequencing.** The Editorial Gate slots primarily into step 3 (foundational Local catalog seed via `iconic_local` curation) and step 7 (Local-mode significance floors / per-category surfacing gate tuning). It generalizes those steps' intent — rather than per-category floors and per-category iconic_local passes, the gate makes `editorial_curated` the single Soul-access control across the whole catalog. Per-category floors still exist for the significance filter (a row needs to be relevant enough to surface AT ALL); the gate decides which mode it surfaces IN.

**Implementation cross-references:**

- Layer 3 override migration: `supabase/migrations/20260521000001_mode_bifurcation_editorial_gate.sql` (commit `a0d994f`).
- Resolver function: `public.recompute_narrative_modes(pois)` — encodes the three-bucket logic.
- Trigger: `pois_narrative_modes_recompute` on `public.pois`.
- Manual lock: `pois.narrative_modes_override boolean` — when TRUE, trigger leaves the row alone.

---

**End of addendum.** Hand to build chat for incremental implementation per §11 (status table in §14.1).
