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

export type RegionSource = 'usgs' | 'epa' | 'native_land' | 'wikidata' | 'editorial';

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
  significance_tier: number; // 0-100
  source: RegionSource;
  source_id: string | null;
  parent_region_id?: string | null;
  /**
   * Per-row structured side-data. Optional — defaults to `{}` at upsert
   * time. Native Land Digital rows (E1c) use this for boundary
   * disclaimer + attribution metadata; other sources may extend.
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
