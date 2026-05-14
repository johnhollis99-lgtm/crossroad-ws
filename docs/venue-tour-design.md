# Venue Tour → Design Specification

**Status:** Locked-in design (v1.0)
**Audience:** All future imports, dedup runs, trigger logic, frontend, and admin tooling.
**Scope:** California (launch) → all states → international (eventually).

---

## 1. What Venue Tour Is

Venue Tour is the **fourth interaction paradigm** in RoadStory, alongside Driving, Hiking, and City Sightseeing.

It addresses a fundamental data shape: many POIs are **containers** that hold dozens of sub-POIs.

| Container | Sub-POIs |
|---|---|
| Disneyland | Big Thunder Mountain, Pirates of the Caribbean, Main Street, Sleeping Beauty Castle... |
| Mission San Juan Capistrano | Chapel, museum, ruins, cemetery, gardens, plaza |
| Stanford Campus | Hoover Tower, Memorial Church, Cantor Arts Center, the Quad... |
| Yosemite National Park | Half Dome, El Capitan, Bridalveil Fall, Tunnel View, Yosemite Falls... |
| Olvera Street | Avila Adobe, Pelanconi House, Old Plaza Firehouse... |

**Drive-by experience:** trigger only the parent ("You're approaching Disneyland Park, opened by Walt Disney in 1955...").

**Walking-inside-the-venue experience:** trigger only the children, with tighter spacing and tour-mode narration.

This is not just a UX choice — it's a **data model decision** that affects how every POI is stored, classified, and queried.

---

## 2. Core Principles

### 2.1. Hierarchy is data-first

Parent-child relationships are stored on the POI record itself, not derived at runtime. This means:

- Spatial queries can filter children efficiently (`WHERE parent_poi_id IS NULL` for drive-by)
- The narration cache is structured around parent-child semantics
- Importers establish the hierarchy at write time, not after

### 2.2. Containment is necessary but not sufficient

A POI being inside a venue polygon **does not** automatically make it a child. Counter-examples:

- **Campo de Cahuenga** is inside (or adjacent to) Universal Studios property, but it's an 1847 historic site that predates the park by 70 years. It stays standalone.
- **Watts Towers** are inside Watts Towers Arts Center — but the Towers are the famous landmark, the Arts Center surrounds them. Towers are the parent if anything.
- **Hearst Castle's Neptune Pool** is one of the most famous features of the estate — child of Hearst Castle.

The classifier needs **rules beyond geometry**.

### 2.3. Suppress not delete

Theme park rides, mission chapels, campus buildings — these all stay in the database with full data. They're suppressed at trigger time based on user mode + speed + location. We never throw data away just because it's noisy in one mode.

### 2.4. Polygons come from real sources

We don't hand-draw polygons for the 80+ initial CA venues. Wikidata, OSM, and NPS publish authoritative geometries. Admin manual polygon drawing is a fallback only.

---

## 3. Schema Changes

### 3.1. Migration: add venue columns to `pois`

```sql
-- Migration: 2026XXXX000001_venue_tour_schema.sql

-- Parent-child relationship
ALTER TABLE pois
  ADD COLUMN parent_poi_id uuid REFERENCES pois(id) ON DELETE SET NULL;

CREATE INDEX idx_pois_parent_poi_id
  ON pois(parent_poi_id) WHERE parent_poi_id IS NOT NULL;

-- Venue marking
ALTER TABLE pois
  ADD COLUMN is_venue boolean NOT NULL DEFAULT false;

CREATE INDEX idx_pois_is_venue
  ON pois(is_venue) WHERE is_venue = true;

-- Venue polygon (only populated when is_venue = true)
ALTER TABLE pois
  ADD COLUMN venue_polygon geography(Polygon, 4326);

CREATE INDEX idx_pois_venue_polygon
  ON pois USING GIST(venue_polygon)
  WHERE venue_polygon IS NOT NULL;

-- Venue type classification
ALTER TABLE pois
  ADD COLUMN venue_type text;

ALTER TABLE pois ADD CONSTRAINT venue_type_valid CHECK (
  venue_type IS NULL OR venue_type IN (
    'theme_park',
    'campus',
    'national_park',
    'state_park',
    'historic_district',
    'museum_complex',
    'mission',
    'cemetery',
    'zoo_aquarium',
    'estate',
    'shopping_district',
    'fairground',
    'religious_complex',
    'industrial_complex'
  )
);

CREATE INDEX idx_pois_venue_type
  ON pois(venue_type) WHERE venue_type IS NOT NULL;

-- Flexible per-venue metadata
ALTER TABLE pois
  ADD COLUMN venue_metadata jsonb;

-- Constraints
ALTER TABLE pois ADD CONSTRAINT venue_polygon_requires_is_venue CHECK (
  venue_polygon IS NULL OR is_venue = true
);
ALTER TABLE pois ADD CONSTRAINT venue_type_requires_is_venue CHECK (
  venue_type IS NULL OR is_venue = true
);
ALTER TABLE pois ADD CONSTRAINT child_cannot_be_venue CHECK (
  NOT (parent_poi_id IS NOT NULL AND is_venue = true)
);
```

The last constraint means a POI cannot simultaneously be a child of a venue AND a venue itself. This prevents nested-venue ambiguity for the v1 implementation. (We can revisit if we encounter legitimate cases — e.g., an embedded museum inside a national park.)

### 3.2. New RPC: get_venue_tour_pois

```sql
-- Returns ordered child POIs for a venue, optimized for tour mode
CREATE OR REPLACE FUNCTION get_venue_tour_pois(
  p_parent_poi_id uuid,
  p_user_lat double precision DEFAULT NULL,
  p_user_lon double precision DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  category text,
  location geography,
  significance_score numeric,
  distance_meters double precision
) LANGUAGE sql STABLE AS $$
  SELECT
    p.id,
    p.name,
    p.category,
    p.location,
    p.significance_score,
    CASE
      WHEN p_user_lat IS NOT NULL AND p_user_lon IS NOT NULL
      THEN ST_Distance(
        p.location,
        ST_GeogFromText(format('POINT(%s %s)', p_user_lon, p_user_lat))
      )
      ELSE NULL
    END AS distance_meters
  FROM pois p
  WHERE p.parent_poi_id = p_parent_poi_id
    AND p.merged_into IS NULL
  ORDER BY
    CASE WHEN p_user_lat IS NOT NULL THEN
      ST_Distance(p.location, ST_GeogFromText(format('POINT(%s %s)', p_user_lon, p_user_lat)))
    ELSE 1.0 / GREATEST(p.significance_score, 1)
    END ASC;
$$;
```

### 3.3. New RPC: detect_venue_at_location

```sql
-- Returns the innermost venue containing a given lat/lon, if any
CREATE OR REPLACE FUNCTION detect_venue_at_location(
  p_lat double precision,
  p_lon double precision
)
RETURNS TABLE (
  id uuid,
  name text,
  venue_type text,
  polygon_area_m2 double precision
) LANGUAGE sql STABLE AS $$
  SELECT
    p.id,
    p.name,
    p.venue_type,
    ST_Area(p.venue_polygon) AS polygon_area_m2
  FROM pois p
  WHERE p.is_venue = true
    AND p.merged_into IS NULL
    AND p.venue_polygon IS NOT NULL
    AND ST_Contains(
      p.venue_polygon::geometry,
      ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)
    )
  ORDER BY ST_Area(p.venue_polygon) ASC  -- innermost (smallest) first
  LIMIT 1;
$$;
```

### 3.4. Update get_nearby_pois

The existing RPC must default to filtering out children:

```sql
-- pseudocode patch
CREATE OR REPLACE FUNCTION get_nearby_pois(
  p_lat ...,
  p_lon ...,
  p_radius_meters ...,
  p_category_filter ...,
  p_include_children boolean DEFAULT false  -- NEW PARAMETER
)
RETURNS ... AS $$
  SELECT ...
  FROM pois
  WHERE merged_into IS NULL
    AND (p_include_children OR parent_poi_id IS NULL)  -- NEW CLAUSE
    AND ST_DWithin(...)
  ORDER BY ...
$$;
```

When the app is in Venue Tour mode, it calls `get_venue_tour_pois` instead of `get_nearby_pois`. When driving/hiking, it uses `get_nearby_pois` with the default `p_include_children=false`.

### 3.5. Extend `narration_audio.mode` CHECK for venue_tour

Venue Tour adds a fourth `trip_mode` value. The existing CHECK on `narration_audio.mode` allows only `('driving','hiking','city')` and must be extended:

```sql
-- Migration: 2026XXXX000002_narration_audio_add_venue_tour.sql
ALTER TABLE narration_audio DROP CONSTRAINT narration_audio_mode_check;
ALTER TABLE narration_audio ADD CONSTRAINT narration_audio_mode_check
  CHECK (mode IN ('driving','hiking','city','venue_tour'));
```

The existing UNIQUE `(poi_id, narrator_slug, depth, mode)` continues to apply → `'venue_tour'` rows coexist with the other three modes for the same POI, since the same Big Thunder Mountain has separate audio for drive-by (where it's suppressed as a child) vs. venue-tour-mode (where it's the trigger).

The Storage path `{poi_id}/{trip_mode}/{depth}/{narrator_slug}.opus` accommodates `venue_tour` without further change. The cache-key shape is unchanged; only the value space expands.

---

## 4. Classification Algorithm

This runs during every POI import, applied uniformly across OSM, Wikidata, NRHP, CHL, GNIS, and narrative-extracted sources.

### 4.1. Pseudocode

```typescript
async function classifyPOI(candidate: NormalizedPOI): Promise<{
  parent_poi_id: uuid | null;
  is_venue: boolean;
  venue_type: VenueType | null;
  venue_polygon: GeoJSON.Polygon | null;
}> {
  // Step 1: Determine if THIS POI is itself a venue
  const venueInfo = detectVenueFromTags(candidate);

  if (venueInfo.is_venue) {
    // This POI is a container. It cannot also be a child.
    return {
      parent_poi_id: null,
      is_venue: true,
      venue_type: venueInfo.venue_type,
      venue_polygon: venueInfo.polygon  // fetched from source
    };
  }

  // Step 2: Spatial containment check — is this POI inside any venue?
  const containingVenue = await db.queryOne(
    `SELECT id, venue_type FROM pois
     WHERE is_venue = true
       AND merged_into IS NULL
       AND ST_Contains(venue_polygon::geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326))
     ORDER BY ST_Area(venue_polygon) ASC LIMIT 1`,
    [candidate.lon, candidate.lat]
  );

  if (!containingVenue) {
    // Standalone POI
    return { parent_poi_id: null, is_venue: false, venue_type: null, venue_polygon: null };
  }

  // Step 3: Apply standalone-exception rules
  if (shouldRemainStandalone(candidate, containingVenue)) {
    return { parent_poi_id: null, is_venue: false, venue_type: null, venue_polygon: null };
  }

  // Step 4: This POI is a child of containingVenue
  return {
    parent_poi_id: containingVenue.id,
    is_venue: false,
    venue_type: null,
    venue_polygon: null
  };
}
```

### 4.2. Detect-venue-from-tags rules

Source-specific rules that flag a POI as `is_venue=true` during import:

**OSM tags:**
- `tourism=theme_park` → venue_type: `theme_park`
- `boundary=national_park` → venue_type: `national_park`
- `leisure=park` AND area > 100,000 m² AND name — venue_type: `state_park` (or `park` if smaller scale)
- `amenity=university` → venue_type: `campus`
- `tourism=zoo` OR `tourism=aquarium` → venue_type: `zoo_aquarium`
- `historic=district` → venue_type: `historic_district`
- `tourism=museum` AND `building` polygon area > 5,000 m² with multiple sub-features — venue_type: `museum_complex`
- `historic=mission` OR (`amenity=place_of_worship` + `historic=mission`) — venue_type: `mission`
- `landuse=cemetery` AND named — venue_type: `cemetery`

**Wikidata P31 (instance of) values:**
- `Q1116364` (theme park) — venue_type: `theme_park`
- `Q46169` (national park) — venue_type: `national_park`
- `Q3914` (high school) / `Q3918` (university) — venue_type: `campus`
- `Q43229` (organization) is too broad — skip
- `Q1248784` (cemetery) — venue_type: `cemetery`
- `Q43501` (zoo) — venue_type: `zoo_aquarium`
- `Q1572600` (Spanish mission) / `Q120560` (mission station) — venue_type: `mission`

**Polygon required:** A POI is only marked `is_venue=true` if the source provides a polygon. If only a point is available, it's stored as a regular POI for now (and can be promoted to a venue later when a polygon becomes available).

### 4.3. Standalone-exception rules

A POI inside a venue polygon should remain standalone (`parent_poi_id=null`) if **any** of these are true:

| Rule | Rationale |
|---|---|
| `source_type IN ('nrhp', 'state_landmark')` AND venue.venue_type IN ('theme_park', 'campus', 'park') | Historic landmarks predate or are independent of modern venues. Campo de Cahuenga (1847) inside Universal (1915) — keep standalone. |
| `additional_sources` length ⥠2 (multi-source verified independent significance) | Cross-source verification implies independent prominence. |
| `confidence_score < 0.7` (uncertain geocoding) | Don't auto-link uncertain POIs into venues — they may be incorrectly placed. |
| Source name explicitly contains the venue name as ownership ("Disneyland Hotel", "Stanford Memorial Church") | These are intentionally part of the venue. **Override**: this rule is OFF, since these ARE children. |
| POI was imported BEFORE this venue existed (`pois.imported_at < venue.imported_at`) | Existing POI shouldn't be retro-claimed by a newly-imported venue without review. Safer default. |

For ambiguous cases, the importer logs to a `venue_classification_review` table for admin sweep — never silently makes a wrong call.

### 4.4. Multiple containing venues

If a POI is inside multiple venue polygons (nested venues), use the **innermost (smallest by area)**. Example: an exhibit inside the Aquarium of the Pacific, which is inside the Long Beach Convention & Entertainment district.

The smaller polygon "wins" because it's the more specific container.

---

## 5. Polygon Sources

### 5.1. Primary sources by venue type

| Venue Type | Primary Source | Fallback |
|---|---|---|
| theme_park | OSM `tourism=theme_park` polygons | Wikidata + manual draw |
| national_park | NPS GeoJSON downloads | OSM `boundary=national_park` |
| state_park | CA State Parks GIS portal | OSM `leisure=park` polygons |
| campus | OSM `amenity=university` polygons | Manual draw |
| historic_district | OSM `historic=district` | NRHP boundary descriptions (rare) |
| museum_complex | OSM `tourism=museum` polygon + name match | Manual draw |
| mission | Manual draw based on cadastral records | OSM polygon if mission grounds tagged |
| zoo_aquarium | OSM `tourism=zoo`/`tourism=aquarium` polygons | Manual draw |
| cemetery | OSM `landuse=cemetery` | Manual draw |

### 5.2. Polygon import rule

When importing a POI flagged as `is_venue=true`:

1. Attempt to fetch a polygon from the source
2. If found, store it in `venue_polygon`
3. If not found, set `is_venue=false` (POI stays as a regular POI) and log to admin review queue: "Candidate venue without polygon — needs manual draw"

This prevents half-classified venues that have no spatial bounds.

### 5.3. Manual polygon admin tooling

A future admin UI feature (Phase 8) lets curators:
- See the venue review queue
- Draw a polygon on a map for un-bounded venues
- Trigger a re-classification of POIs inside the new polygon

For the initial CA seeding, the venue catalog (Section 8) gets manually verified polygons before any backfill runs.

---

## 6. Trigger Logic (App Layer)

### 6.1. Mode detection

```typescript
function detectMode(userContext: UserContext): TripMode {
  if (userContext.speed > 6_kmh) return 'driving_or_cycling';

  // Walking speed — check for venue containment
  const venue = await rpc('detect_venue_at_location', {
    lat: userContext.lat,
    lon: userContext.lon
  });

  if (venue && userContext.dwellSeconds > 30) {
    // User has been inside the venue for at least 30 seconds while walking
    return 'venue_tour';
  }

  if (userContext.tripPage === 'hiking') return 'hiking';
  return 'city_sightseeing';
}
```

Mode transitions:
- Driving → Venue Tour: prompt "Looks like you've arrived at Disneyland! Start the audio tour?" (one-tap accept)
- Venue Tour → Driving: detected when user leaves polygon and speed > walking. Suspend tour, save progress.

### 6.2. Trigger eligibility by mode

| Mode | Eligible POIs | Trigger Radius |
|---|---|---|
| Driving | `parent_poi_id IS NULL` (parents and standalones only) | Speed-scaled (150–800m) |
| Hiking | `parent_poi_id IS NULL` | 80m |
| City Sightseeing | `parent_poi_id IS NULL` | Tap-to-hear |
| Venue Tour | `parent_poi_id = $current_venue_id` | 20–30m |

The driving/hiking/city queries already use `get_nearby_pois` (defaults to parents-only). Venue Tour uses `get_venue_tour_pois`.

### 6.3. Narration prompt context

Different prompt templates apply for venue children:

**Driving narration of a parent:**
> "On your right, Disneyland Resort — opened in 1955 by Walt Disney as the original Magic Kingdom. Today it spans two parks across 500 acres."

**Venue Tour narration of a child:**
> "You're approaching Big Thunder Mountain Railroad. This 1979 attraction was inspired by the rock formations of Bryce Canyon and Monument Valley. Walt Disney Imagineering designed it as the company's first thrill ride after Walt's death..."

`venue_tour` becomes a new `trip_mode` value alongside `driving`/`hiking`/`city`. This requires extending the CHECK constraint on `narration_audio.mode` to include `'venue_tour'` (see new migration in §3). Three new prompt templates are needed at the `trip_mode × depth` level: `venue_tour_brief`, `venue_tour_standard`, `venue_tour_long`. The four audience modes (Family, Kids, Unfiltered, Local) and two narrators (Narrator A reverent, Narrator B conversational) layer on top of each.

**⚠️ Per `roadstory-narration-curation-addendum.md` §5:** the narrator system has been consolidated from four (Professor/Local/Junior Ranger/Truck Driver) to two (Narrator A/B). The template-count math below is updated accordingly.

This adds **6 templates** for `venue_tour` trip mode (3 depths × 2 narrators, with audience mode applied at the voice_configs layer). Most venue children default to `standard` intrinsic_depth (walk-up callouts), so the `brief` and `long` variants are used selectively. Implementation is incremental — start with Narrator A + Standard for first ship.

### 6.4. Significance suppression for children

A child POI's `significance_score` should NOT compete with parents for drive-by triggering. Two options:

**Option A (chosen):** Computed at query time
- The `get_nearby_pois` RPC excludes children by default, so their significance is irrelevant for drive-by
- No separate score needed

**Option B (rejected):** Separate `venue_tour_significance` column
- Adds complexity without clear benefit
- The unified `significance_score` works for both contexts because the RPC filters appropriately

Children keep their `significance_score` for use in venue tour ordering — Big Thunder Mountain might rank higher than a small queue area, regardless of their parent.

---

## 7. Importer Integration

Each importer (`osm.ts`, `wikidata.ts`, `nrhp.ts`, `ca-landmarks.ts`, narrative-extracted) calls `classifyPOI()` after normalization, before upsert.

### 7.1. Import order matters

For classification to work, **venues must be imported before their children**. Three approaches:

**Approach A: Two-pass import (chosen for backfill)**
1. Pass 1: import all POIs flagged as venues (with polygons)
2. Pass 2: import all other POIs, running `classifyPOI` against the venue table

**Approach B: Single-pass with deferred classification (chosen for ongoing imports)**
1. Import all POIs in one pass
2. Run a separate `classify-children.ts` script after each import that calls `classifyPOI` for any POI where `parent_poi_id IS NULL AND is_venue = false`

Approach B is simpler for incremental imports (e.g., a new county). The classification step runs as part of the standard pipeline:

```
OSM import → Wikidata import → NRHP import → CHL import
  — Dedup
  → Classify children   → NEW STEP
  — Significance recompute
```

### 7.2. Classifier as standalone script

`scripts/poi-import/classify-children.ts`:

```typescript
// Run on all unclassified POIs against current venue catalog
// CLI flags:
//   --county=<name>    : restrict to a county bbox
//   --dry-run          : log proposed classifications without writing
//   --since=<date>     : only POIs imported after this date

// Output:
//   Total POIs scanned
//   New parent-child relationships established
//   Standalone-exception rule firings (with reasons)
//   POIs that need manual review (venue-without-polygon, ambiguous nesting, etc.)
```

This script is also used for backfill (Section 9).

### 7.3. Re-classification on venue updates

If a venue's polygon is updated (admin redraw), trigger a re-classification scoped to that venue's bbox + a buffer. New polygon may include POIs that were previously standalone, or exclude POIs that should now go standalone.

---

## 8. Initial California Venue Catalog

This is the seed list. Each entry has been verified to have a fetchable polygon.

### 8.1. Theme parks (8)
- Disneyland Park (Anaheim)
- Disney California Adventure Park (Anaheim)
- Universal Studios Hollywood (Universal City)
- Knott's Berry Farm (Buena Park)
- Six Flags Magic Mountain (Valencia)
- Six Flags Discovery Kingdom (Vallejo)
- California's Great America (Santa Clara)
- Legoland California (Carlsbad)
- SeaWorld San Diego

### 8.2. National Parks (9)
- Yosemite, Sequoia, Kings Canyon, Death Valley, Joshua Tree, Lassen Volcanic, Pinnacles, Channel Islands, Redwood

### 8.3. Major State Parks (selection — full list TBD)
- Anza-Borrego Desert SP, Henry Cowell Redwoods SP, Pfeiffer Big Sur SP, Andrew Molera SP, Mt Tamalpais SP, Crystal Cove SP, Hearst San Simeon SHP

### 8.4. Spanish Missions (21)
All 21 California missions. The "complex" includes chapel, museum, ruins, gardens, cemetery as children once their geometries are imported.

### 8.5. University Campuses (10)
- UC Berkeley, Stanford, UCLA, USC, Caltech, UCSD, UC Davis, UCSB, UC Irvine, UC Santa Cruz

### 8.6. Historic Districts (selection)
- Olvera Street / El Pueblo de Los Angeles, Old Town San Diego, Chinatown SF, Japantown SF, Old Town Pasadena, Sutter's Fort, Bodie SHP

### 8.7. Museum Complexes
- Getty Center, Getty Villa, Huntington Library, Hearst Castle, Balboa Park (San Diego), Exposition Park (Los Angeles), San Francisco Maritime NHP

### 8.8. Zoos & Aquariums
- Los Angeles Zoo, San Diego Zoo, San Diego Zoo Safari Park, Monterey Bay Aquarium, Aquarium of the Pacific, Birch Aquarium, San Francisco Zoo, Oakland Zoo

### 8.9. Major Cemeteries (notable graves)
- Forest Lawn Glendale, Hollywood Forever, Westwood Village Memorial, Mountain View Cemetery (Oakland), Mission Dolores Cemetery

**Estimated total: ~80 venues for California seed.**

A `scripts/poi-import/seed-venues.ts` script fetches polygons for each from OSM/Wikidata/NPS, upserts as venues, and queues any without findable polygons for manual draw.

---

## 9. Backfill Plan

### 9.1. Order of operations

1. **Apply schema migration** (Section 3.1)
2. **Run venue seeding** — populate the ~80 CA venues with polygons via `seed-venues.ts`
3. **Run `classify-children.ts --dry-run`** on all 20,148 existing POIs
4. **Review the classification report:**
   - Sample 50 random parent-child assignments
   - Inspect all standalone-exception firings
   - Flag any concerning patterns
5. **Commit classification** if the dry-run looks clean
6. **Update `get_nearby_pois`** RPC to exclude children by default (Section 3.4)
7. **Add `get_venue_tour_pois` and `detect_venue_at_location` RPCs**
8. **Run significance recompute** — children's significance no longer competes with parents at query time, so the top-25 will look correct for the first time

### 9.2. Expected backfill outcomes

Based on the existing data:

| Source of Children | Estimated Count |
|---|---|
| Disneyland + DCA rides/areas | ~80 |
| Universal Studios attractions | ~30 |
| Knott's, Six Flags, Legoland, SeaWorld | ~80 |
| All 9 National Parks features | ~150 |
| Major state parks features | ~100 |
| Mission sub-features | ~50 |
| University campus buildings | ~200 |
| Historic district landmarks | ~150 |
| Museum complex sub-museums | ~30 |
| Cemetery notable graves | ~50 |
| Zoo/aquarium exhibits (often not in OSM) | ~20 |

**Estimated total: 800–1,200 POIs reclassified as children** (4–6% of the dataset).

After backfill, the top-25 list should look like:
1. Hollywood Sign
2. Mount Whitney
3. Yosemite National Park (was suppressed, now properly visible as parent)
4. Mission San Juan Capistrano
5. Walk of Fame
6. Sequoia National Park
7. Disneyland Resort (was suppressed)
8. Hearst Castle
... etc.

Disney rides drop out of the top-25 entirely — they're children, not standalone POIs.

### 9.3. Manual review cases

The 3 flagged cases from `docs/data-quality-issues.md` resolve cleanly under this design:

| Case | Resolution under Venue Tour |
|---|---|
| Mission Soledad Museum vs Mission Soledad | Museum becomes a child of the Mission complex once Mission has polygon |
| Mission San José NRHP at wrong coordinates | Standalone-exception rule (poor geocoding flagged via `confidence_score < 0.7`) — flagged for manual review |
| "Mission San Fernando Rey de Convento Building" = Avila Adobe (31km off) | Geocoding error in source; flagged for manual review and re-categorization |

---

## 10. Edge Cases & Open Decisions

### 10.1. Confirmed decisions
- **Children cannot also be venues** (constraint in schema). If we encounter legitimately nested venues (museum-inside-park), the inner gets `is_venue=false` and the outer wins. We'll revisit if this proves limiting.
- **Polygon required for venue status.** No polygon — no venue status until a polygon is provided.
- **Source-priority dedup applies to venues too.** If two venues are imported (e.g., Wikidata Yosemite + OSM Yosemite), they merge into one canonical venue per the existing source-priority rule (state_landmark > nrhp > wikidata > osm).

### 10.2. Open decisions (deferred)
- **Cross-venue trips** (e.g., a tour bus that visits Disneyland, then Universal). Handle as two separate venue tour sessions. No special data modeling needed.
- **Time-varying venue boundaries** (e.g., Disneyland's expanding footprint). Use current polygon; ignore historical boundaries. Park map year doesn't affect narration eligibility.
- **Seasonal venue activations** (e.g., Halloween Horror Nights at Universal). Out of v1 scope. Children list is static per venue.
- **User-defined venues** (e.g., a tour guide creating their own custom walking tour). Out of v1 scope. Future feature.

### 10.3. Things this design explicitly does NOT do
- Does NOT solve the "Walk of Fame" cluster issue — that's a duplication problem, not a hierarchy problem (Section 11)
- Does NOT solve the Misión—Mission language variant — that's a normalization problem
- Does NOT replace the existing dedup pipeline — venue classification runs *after* dedup
- Does NOT generate narration content automatically — narration prompts and TTS still live in `scripts/lib/tts/` and the prompt template system

---

## 11. Relationship to Other Pipeline Stages

| Stage | Affected By Venue Tour? | How |
|---|---|---|
| Schema | Yes (Section 3) | New columns on `pois`, new constraints, new RPCs, and `narration_audio.mode` CHECK extended to include `'venue_tour'` (§3.5) |
| Importers (OSM/Wikidata/NRHP/CHL/narrative) | Yes (Section 7) | Each calls `classifyPOI()` after normalization |
| Dedup | No | Runs before classification; merges venue duplicates same as any other POI |
| Significance recompute | Indirectly | Children's scores stop competing with parents at query time, so distribution becomes more meaningful |
| Narration generation | Yes (Section 6.3) | New prompt templates for venue tour trip_mode (3 depths × 2 narrators = 6 base templates; audience layered at voice level per addendum §5) |
| TTS generation | No | Same provider abstraction, same cache-key shape `{poi_id}/{trip_mode}/{depth}/{narrator_slug}.opus`; only the `trip_mode` value space expands |
| Frontend (Expo + React Native) | Yes | New Venue Tour page, mode auto-detection on user dwell |
| WS Server | Yes | New events: `venue_entered`, `venue_exited`, `venue_tour_started` |
| Admin tooling | Yes | Polygon drawing, venue review queue, classification dry-run |

---

## 12. Implementation Phases

| Phase | Scope | Blocker for |
|---|---|---|
| **V1** (now) | Schema migration, classifier algorithm, venue seed for ~80 CA venues, backfill, RPC updates | All future imports |
| **V2** (next) | Update OSM/Wikidata/NRHP/CHL importers to call `classifyPOI()` | Santa Barbara + Ventura imports |
| **V3** (later) | Venue tour prompt templates (Narrator A + Standard first), UI mode detection. **Depends on**: narrator collapse migration from curation addendum §5. | App launch |
| **V4** (later) | Admin polygon drawing, venue review queue, classification override UI | Scaling beyond CA |
| **V5** (much later) | International venue catalog, multi-language venue support | International expansion |

---

## 13. Acceptance Criteria for V1

V1 is complete when:

- [ ] Migration applied to staging Supabase
- [ ] Venue seed script imports ≥75 of the 80 CA venues with polygons (≥94% success rate)
- [ ] Classification dry-run shows ≥800 POIs reclassified as children
- [ ] Random sample of 30 classifications shows 30/30 correct
- [ ] All 5 standalone-exception rules verified firing on at least one case each
- [ ] Top-25 POIs by significance no longer contains theme park rides
- [ ] All 21 California missions show as venues with at least 2 child sub-features each (chapel, museum, etc., where data exists)
- [ ] `get_venue_tour_pois` returns reasonable ordering for Disneyland (≥30 children, ordered by user distance or significance)
- [ ] `detect_venue_at_location` returns Disneyland Park when called with Cinderella Castle coordinates
- [ ] Manual review queue contains the 3 known data-quality cases

---

## 14. References

- `roadstory-poi-pipeline-prompts.md` → phased import playbook
- `roadstory-narration-curation-addendum.md` → narrator/depth/pace/significance model (supersedes older narrator references in this doc)
- `roadstory-unified-roadmap.md` → sequencing across all pending work
- `SKILL.md` → project skill (architecture, audience modes, narration depths)
- `docs/data-quality-issues.md` → tracked manual-review cases

---

**End of Specification.**
