# region-import

Region ingestion pipeline for XRoad. Implements **Phase E1** of [docs/roadstory-unified-roadmap.md](../../docs/roadstory-unified-roadmap.md). Spec: [docs/roadstory-narration-curation-addendum.md §3](../../docs/roadstory-narration-curation-addendum.md).

Loads four region layers into the `regions` table (migration `20260514000005_regions.sql`):

| Source | region_type | Tier | Approx. rows in CA |
|---|---|---|---|
| USGS Geomorphic Provinces | `geomorphic_province` | 80 | 11 |
| EPA Level III Ecoregions | `ecoregion` | 60 | ~13 |
| Native Land Digital | `indigenous_territory` | 85 | ~30 |
| Named valleys / basins (Wikidata + editorial polygons) | `named_valley_or_basin` | 75 | ~30 (top 30 by sitelink count; ~10 with editorial polygons) |

Watershed (HUC8) layer is deferred to v2 per addendum §3.8.

## Prerequisites

Two prerequisites are NOT in place yet. Both are flagged in the scaffolding response; resolve before running any source body.

1. **UNIQUE constraint on `regions(source, source_id)`.** The upsert helper uses `ON CONFLICT (source, source_id) DO UPDATE …`. Migration `20260514000005_regions.sql` did not add this constraint, and the addendum §3.1 schema doesn't specify one. Without it, every upsert fails. Proposed migration `20260514000008_regions_source_unique.sql` (small, ~10 lines, idempotent) adds the constraint as a partial unique index that ignores rows with `source_id IS NULL` (editorial regions can share a NULL source_id).
2. **`region_review_queue` table.** Named-valleys importer (E1d) logs polygon-less candidates here. Table doesn't exist. Proposed migration `20260514000009_region_review_queue.sql` creates it with the same shape as `venue_classification_review`.

Both migrations are written but **not applied** when this scaffolding lands. See the scaffolding-response thread for the SQL and the apply gate.

## Env vars

Reads from the repo-root `.env`:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
```

`DATABASE_URL` must be the direct connection string (not the pooler), URL-encoded as needed. Same convention as scripts/poi-import.

## Install

```
cd scripts/region-import
npm install     # or pnpm install
```

## Run

```
pnpm import -- --source=usgs                 # USGS provinces only
pnpm import -- --source=epa                  # EPA ecoregions (requires USGS rows present)
pnpm import -- --source=native_land
pnpm import -- --source=named_valleys
pnpm import -- --source=all                  # All four, in dependency order
pnpm import -- --source=usgs --dry-run       # Preview without writing
pnpm import -- --source=usgs --force         # Re-download, bypass cache
```

Or directly:

```
npx tsx run.ts import --source=all
```

## Source-specific notes

### E1a — USGS Geomorphic Provinces

11 polygons. `source_id` is the kebab-case slug of the province name. `description` is editorial — hand-written 200–400 word reference text per province (this becomes narration source material in Phase E2).

### E1b — EPA Level III Ecoregions

~13 polygons for CA. After fetch, the importer queries the regions table for USGS rows and resolves `parent_region_id` via `ST_Within(ecoregion_polygon, province_polygon)`. Must run after E1a.

### E1c — Native Land Digital

Indigenous territories from native-land.ca. Free API, attribution required.

**Data ethics:** Per Native Land's guidance, boundaries are approximate and educational, not legal. The importer prefixes each `description` with the attribution line + an "approximate boundaries" disclaimer. This nuance must be preserved by Phase H narration templates.

The regions table has no dedicated `note` column, so the disclaimer lives in `description`. If we later need richer per-row notes, the natural shape would be a `metadata jsonb` column.

### E1d — Named valleys and basins

Hybrid: Wikidata for names + Q-numbers (top 30 by Wikipedia sitelink count), polygon from OSM relation if available, else editorial polygon for the top 10. Valleys with no polygon are logged to `region_review_queue` rather than dropped.

Editorial polygons (drawn manually for the top 10) live in `data/editorial-valleys.geojson` (not yet committed — added in E1d implementation).

## Cache layout

Cache files are gitignored under `scripts/region-import/cache/`:

```
cache/
  usgs/                  # USGS Geomorphic Provinces download (with .meta.json sidecar, 30-day TTL)
  epa/                   # EPA Level III shapefile download (same TTL)
  native_land/           # API response cache
  wikidata-valleys/      # SPARQL responses
  osm-valley-relations/  # Overpass responses per valley
  regions-{timestamp}.json   # Run summary
```

## Verification (post-run)

```sql
SELECT region_type, COUNT(*), AVG(significance_tier)::int AS avg_tier
  FROM regions
 GROUP BY region_type
 ORDER BY region_type;

-- Expect roughly:
--   ecoregion                 ~13   60
--   geomorphic_province        11   80
--   indigenous_territory      ~30   85
--   named_valley_or_basin    ≤30   75
```

Plus a smoke test of the parent linkage:

```sql
SELECT r.name AS ecoregion, p.name AS containing_province
  FROM regions r
  JOIN regions p ON r.parent_region_id = p.id
 WHERE r.region_type = 'ecoregion'
 ORDER BY p.name, r.name;
```

## What this script does NOT do

- Pre-generate narration audio. That's **Phase E2**, gated behind voice_configs work in Phase D3 (per the curation addendum).
- Touch any POI data.
- Modify the regions schema. Prerequisite migrations are tracked separately.
