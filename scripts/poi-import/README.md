# XRoad POI import pipeline

Multi-source ETL for the `pois` table. Each source is an idempotent importer keyed on `(source_type, source_id)` — rerunning updates rather than duplicates, courtesy of the partial unique index added in migration `20260504000005_poi_source_provenance`.

This directory has its own `package.json` to keep CLI/Node tooling deps (commander, chalk, tsx, dotenv) out of the Expo app bundle.

## Status

| Source         | `source_type`      | Status |
| -------------- | ------------------ | ------ |
| OSM Overpass   | `osm`              | Stub   |
| Wikidata SPARQL| `wikidata`         | Stub   |
| NRHP           | `nrhp`             | Stub   |
| CA Landmarks   | `state_landmark`   | Stub   |
| USGS GNIS      | `gnis`             | Stub   |

Shared lib (`./lib/`) is implemented: types, admin Supabase client, name-similarity dedupe, Nominatim geocoder with rate limit + cache, significance scoring, category mapping, and batch upsert.

## Setup

```powershell
cd "scripts/poi-import"
npm install
```

Required environment variables (place in `scripts/poi-import/.env`, which is gitignored):

| Var                          | Purpose                                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| `SUPABASE_URL`               | e.g. `https://eusozlexmllovlmngmug.supabase.co`                      |
| `SUPABASE_SERVICE_ROLE_KEY`  | Service-role JWT (Project settings → API). **Never commit.**         |

Optional:

| Var                | Purpose                                                                       |
| ------------------ | ----------------------------------------------------------------------------- |
| `NOMINATIM_UA`     | Custom User-Agent for the Nominatim geocoder (defaults to a project string).  |
| `OVERPASS_URL`     | Override Overpass endpoint (default `https://overpass-api.de/api/interpreter`).|

## CLI

```powershell
npm run import -- --source=<name>[,<name>...] [options]
```

Sources: `osm`, `wikidata`, `nrhp`, `ca-landmarks`, `gnis`, or `all`.

Options:

| Flag                                  | Description                                            |
| ------------------------------------- | ------------------------------------------------------ |
| `-b, --bbox minLat,minLon,maxLat,maxLon` | Bounding box filter.                                |
| `-c, --county <name>`                 | County name filter (source-specific).                  |
| `-S, --state <code>`                  | Two-letter US state code, e.g. `CA`.                   |
| `-l, --limit <n>`                     | Cap rows fetched per source.                           |
| `--dry-run`                           | Fetch + normalize but do not write to DB.              |
| `--force`                             | Bypass cache; re-download source data.                 |
| `--cache-dir <path>`                  | Override cache directory (default `./cache`).          |

### Example commands

```powershell
# Smoke-test the wiring (all stubs, no DB writes)
npm run import -- --source=all --dry-run

# Mendocino County, CA — bbox covers Hwy 1 corridor + Anderson Valley
npm run import -- --source=osm,wikidata --bbox=38.75,-123.85,39.55,-123.05

# Import California Historical Landmarks for one county
npm run import -- --source=ca-landmarks --state=CA --county="Mendocino"

# Whole-state NRHP refresh, force re-download of the NPS dump
npm run import -- --source=nrhp --state=CA --force

# GNIS for a small bbox, dry-run first to check normalization
npm run import -- --source=gnis --bbox=37.7,-122.5,37.85,-122.35 --dry-run
```

### Expected runtimes (rough, once implemented)

| Source         | Scope               | Wall time          | Notes                                   |
| -------------- | ------------------- | ------------------ | --------------------------------------- |
| OSM Overpass   | County bbox         | 30 s – 3 min       | Bounded by Overpass server load.        |
| Wikidata       | County bbox         | 10 – 60 s          | One SPARQL call.                        |
| NRHP           | One US state        | 2 – 10 min         | Dominated by Nominatim geocode of rows missing coords (1 req/sec). |
| CA Landmarks   | One county          | 1 – 5 min          | Same — geocoding is the bottleneck.     |
| GNIS           | One US state        | 30 s – 5 min       | High volume; filter aggressively.       |

## Layout

```
scripts/poi-import/
├── lib/
│   ├── supabase.ts     admin client (service role)
│   ├── dedupe.ts       token-set ratio + Levenshtein + haversine
│   ├── geocode.ts      Nominatim, 1 req/sec, on-disk cache
│   ├── significance.ts initial significance score from signals
│   ├── category-map.ts external tags → CategorySlug
│   ├── types.ts        NormalizedPOI, ImportOptions, ImportResult
│   └── upsert.ts       batch upsert (500/batch) on (source_type, source_id)
├── sources/
│   ├── osm.ts          stub — OSM Overpass
│   ├── wikidata.ts     stub — Wikidata SPARQL
│   ├── nrhp.ts         stub — National Register of Historic Places
│   ├── ca-landmarks.ts stub — California Historical Landmarks
│   └── gnis.ts         stub — USGS GNIS
├── cache/              gitignored; downloaded source files live here
├── run.ts              commander CLI
├── package.json
├── tsconfig.json
└── README.md
```

## Importer contract

Each source module exports:

```ts
export const SOURCE_NAME: SourceType;
export async function runImport(opts: ImportOptions): Promise<ImportResult>;
```

The function name is `runImport` rather than `import` because `import` is a reserved keyword in ECMAScript. The CLI imports each module namespace and calls `module.runImport`.

An importer must:

1. **Be idempotent.** Always upsert via `(source_type, source_id)`. Never insert without `ON CONFLICT`.
2. **Cache raw downloads** in `opts.cacheDir`. Re-fetch only when `opts.force` is true.
3. **Respect `opts.dryRun`.** When set, fetch + normalize + log, but skip the upsert.
4. **Emit an `ImportResult`** with `fetched / normalized / inserted / updated / skipped / errors / durationMs`.
5. **Dedup before insert.** Use `lib/dedupe` to spot rows with the same place at a different `source_type`; on a match, append the new source id to `additional_sources[]` of the canonical row instead of creating a parallel POI.

## Adding a new state landmark source

Copy `sources/ca-landmarks.ts`, swap the parser and source URL, and use a new `source_id` prefix (e.g. `OR-LANDMARK-${id}`). Keep `source_type='state_landmark'` — the CHECK constraint allows one landmark bucket across all states; the `source_id` prefix disambiguates.

## Notes

- All distances/coords use WGS84 (EPSG:4326). PostGIS column `geom` is `geography(Point,4326)`.
- The Expo app reads through the anon key; this pipeline reads through the service role key. Don't ship `.env` to the device.
- See `CLAUDE.md` at the project root for the broader pipeline plan and migration history.
