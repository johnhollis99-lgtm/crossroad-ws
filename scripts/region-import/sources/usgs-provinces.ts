/**
 * E1a — USGS Geomorphic Provinces of California.
 *
 * Spec: roadstory-narration-curation-addendum.md §3.3 + user direction.
 *
 * Source: California Geological Survey publishes "Geomorphic Provinces of
 * California" as a downloadable shapefile / GeoJSON. Current download URL
 * is TBD at implementation time — check the CGS data portal and the USGS
 * Science Base catalog.
 *
 * 11 polygons expected:
 *   Klamath Mountains, Cascade Range, Modoc Plateau, Basin and Range,
 *   Sierra Nevada, Great Valley, Coast Ranges, Transverse Ranges,
 *   Peninsular Ranges, Mojave Desert, Colorado Desert.
 *
 * Per-region values:
 *   region_type        = 'geomorphic_province'
 *   source             = 'usgs'
 *   source_id          = <province-name-slug>  (kebab-case canonical)
 *   significance_tier  = 80
 *   description        = 200–400 word editorial reference text
 *                        (hand-written per province; becomes narration
 *                        source material for Phase E2)
 *
 * STUB — implementation pending user greenlight on scaffolding.
 */
import type { ImportOptions, ImportResult } from '../lib/types.js';
import { emptyResult } from '../lib/types.js';

export async function runImport(opts: ImportOptions): Promise<ImportResult> {
  void opts;
  const result = emptyResult('usgs-provinces');
  // TODO: implement
  //   1. Download / cache California Geomorphic Provinces polygons
  //      (shapefile via shpjs OR direct GeoJSON from CGS portal)
  //   2. Per polygon: build NormalizedRegion with hand-written description
  //   3. Upsert via upsertRegions
  //   4. Return populated ImportResult
  throw new Error('usgs-provinces: not yet implemented (Phase E1a)');
}
