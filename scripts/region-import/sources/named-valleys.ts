/**
 * E1d — Named valleys and basins.
 *
 * Spec: roadstory-narration-curation-addendum.md §3.3 + user direction.
 *
 * Hybrid source strategy:
 *   - Wikidata SPARQL for names + Q-numbers (top 30 most-significant CA
 *     valleys by Wikipedia sitelinks count)
 *   - For polygons, fallback chain per valley:
 *       (a) OSM relation tagged natural=valley with complete way
 *       (b) Editorial polygon hand-drawn for top 10 (Owens Valley,
 *           Death Valley, Carrizo Plain, Anza-Borrego, Salinas Valley,
 *           Napa Valley, Sonoma Valley, San Joaquin Valley,
 *           Sacramento Valley, Surprise Valley)
 *
 * Polygon-less valleys → region_review_queue (created lazily).
 *
 * Per-region values:
 *   region_type        = 'named_valley_or_basin'
 *   source             = 'wikidata' (or 'editorial' for hand-drawn)
 *   source_id          = Q-number from Wikidata (or editorial slug)
 *   significance_tier  = 75
 *
 * STUB — implementation pending user greenlight on scaffolding.
 */
import type { ImportOptions, ImportResult } from '../lib/types.js';
import { emptyResult } from '../lib/types.js';

export async function runImport(opts: ImportOptions): Promise<ImportResult> {
  void opts;
  const result = emptyResult('named-valleys');
  // TODO: implement
  //   1. SPARQL query for CA valleys/basins/depressions ranked by sitelink count
  //      Cache at cache/wikidata-valleys/{prefix}.json
  //   2. For each valley:
  //      a. Try OSM relation lookup via Overpass API (rel[natural=valley][name="..."])
  //      b. If no OSM polygon, try editorial-data/editorial-valleys.geojson lookup
  //      c. If neither, log to region_review_queue with reason='no_polygon'
  //   3. Build NormalizedRegion for each valley that has a polygon
  //   4. Upsert via upsertRegions
  throw new Error('named-valleys: not yet implemented (Phase E1d)');
}
