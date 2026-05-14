/**
 * E1b — EPA Level III Ecoregions (California subset).
 *
 * Spec: roadstory-narration-curation-addendum.md §3.3 + user direction.
 *
 * Source: EPA publishes "Level III Ecoregions of the Continental United
 * States" as a shapefile. Filter to CA — expect ~13 Level III ecoregions.
 * Level IV deferred to v2 per user direction.
 *
 * Per-region values:
 *   region_type        = 'ecoregion'
 *   source             = 'epa'
 *   source_id          = US_L3CODE field
 *   significance_tier  = 60
 *   description        = construct from L3NAME + L3_KEY field + brief
 *                        editorial framing line
 *   parent_region_id   = USGS province whose polygon contains this
 *                        ecoregion's centroid (resolved via ST_Within
 *                        post-fetch — requires E1a rows to already exist)
 *
 * STUB — implementation pending user greenlight on scaffolding.
 */
import type { ImportOptions, ImportResult } from '../lib/types.js';
import { emptyResult } from '../lib/types.js';

export async function runImport(opts: ImportOptions): Promise<ImportResult> {
  void opts;
  const result = emptyResult('epa-ecoregions');
  // TODO: implement
  //   1. Download / cache EPA Level III shapefile (us_eco_l3.zip from EPA)
  //   2. Filter to CA (intersect with state bbox or use STATE_NAME = 'California')
  //   3. Build NormalizedRegion per polygon
  //   4. Post-fetch: query regions for source='usgs' rows; for each EPA
  //      ecoregion, set parent_region_id = the USGS province whose
  //      polygon contains the ecoregion centroid (ST_Within)
  //   5. Upsert via upsertRegions
  throw new Error('epa-ecoregions: not yet implemented (Phase E1b)');
}
