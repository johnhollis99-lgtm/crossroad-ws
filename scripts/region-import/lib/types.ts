/**
 * Type definitions for the region-import pipeline.
 *
 * Mirrors the live `regions` table schema (migration 20260514000005). Keep in
 * sync if that schema changes.
 */

export type RegionType =
  | 'geomorphic_province'
  | 'ecoregion'
  | 'watershed'
  | 'indigenous_territory'
  | 'named_valley_or_basin';

/**
 * Allowed values for regions.source. Locked to this 10-value set by the
 * `regions_source_check` CHECK constraint (migration 20260514000010).
 *
 *   osm           — OpenStreetMap relation/way
 *   wikidata      — Wikidata entity (e.g. named valleys via Q-number)
 *   nrhp          — National Register of Historic Places (future: district boundaries)
 *   chl           — California Historical Landmarks (future: district boundaries)
 *   gnis          — USGS Geographic Names Information System
 *   usgs          — federal USGS (reserved; e.g. HUC8 watersheds, federal physiographic)
 *   cgs           — California Geological Survey (e.g. Geomorphic Provinces — E1a)
 *   epa           — EPA Ecoregions (E1b)
 *   native_land   — Native Land Digital (E1c)
 *   editorial     — hand-curated; e.g. editorial valley polygons (E1d fallback)
 */
export type RegionSource =
  | 'osm'
  | 'wikidata'
  | 'nrhp'
  | 'chl'
  | 'gnis'
  | 'usgs'
  | 'cgs'
  | 'epa'
  | 'native_land'
  | 'editorial';

/**
 * A normalized region ready for upsert.
 *
 * `polygon_geojson` is a GeoJSON Polygon or MultiPolygon in [lon, lat] order.
 * The upsert helper converts to a PostGIS EWKT MULTIPOLYGON before INSERT.
 *
 * `parent_region_id` is resolved post-fetch by the importer (e.g., EPA
 * ecoregion → containing USGS province via ST_Within). Importers that have
 * no parent leave it null; the upsert helper passes through whatever's set.
 */
export interface NormalizedRegion {
  region_type: RegionType;
  name: string;
  display_name: string | null;
  description: string;
  polygon_geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  /**
   * SRID of the coordinates in `polygon_geojson`. Defaults to 4326 (WGS84).
   * EPA shapefile data arrives in EPSG:5070 (Albers); pass 5070 here and
   * the upsert helper's ST_Transform will reproject server-side before
   * writing to the geography(MultiPolygon, 4326) column.
   */
  polygon_srid?: number;
  significance_tier: number; // 0-100
  source: RegionSource;
  source_id: string | null;
  parent_region_id?: string | null;
  /**
   * Per-row structured side-data. Optional — defaults to `{}` at upsert
   * time. Native Land Digital rows (E1c) use this for boundary
   * disclaimer + attribution metadata; EPA rows store
   * parent_resolution_method ('centroid' | 'area_intersection') for audit.
   */
  metadata?: Record<string, unknown>;
}

export interface ImportOptions {
  dryRun: boolean;
  force: boolean;       // bypass cache, re-download source data
  cacheDir: string;
}

/**
 * Result shape uniform across all importers. `source` is a free-form label
 * (the source-key from the CLI) rather than the DB enum so the per-source
 * subdirectories under cache/ can be named with hyphens etc.
 */
export interface ImportResult {
  source: string;
  fetched: number;
  normalized: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  reviewQueueEntries: number; // for regions that couldn't be loaded (no polygon, etc.)
  durationMs: number;
}

export function emptyResult(source: string): ImportResult {
  return {
    source,
    fetched: 0,
    normalized: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    reviewQueueEntries: 0,
    durationMs: 0,
  };
}

/**
 * A row queued for human review when the importer can't load a polygon.
 * Lives in the `region_review_queue` table (see lib/upsert.ts header for
 * the schema dependency note).
 */
export interface ReviewQueueEntry {
  candidate_name: string;
  proposed_type: RegionType;
  source: RegionSource;
  source_id: string | null;
  reason: string;
  source_hint?: Record<string, unknown>;
}
