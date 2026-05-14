/**
 * E1c — Native Land Digital (indigenous territories).
 *
 * Spec: roadstory-narration-curation-addendum.md §3.3 + user direction.
 *
 * Source: native-land.ca public API.
 *   Endpoint: https://native-land.ca/api/index.php?maps=territories
 *   Free, attribution required.
 *
 * Filter to territories intersecting California bbox. Expect ~30 results.
 *
 * Per-region values:
 *   region_type        = 'indigenous_territory'
 *   source             = 'native_land'
 *   source_id          = API id field
 *   significance_tier  = 85
 *   description        = API description + REQUIRED attribution preamble
 *                        + ethics note: "Boundaries shown here are
 *                          approximate and educational. They do not
 *                          represent legal claims or official tribal
 *                          territorial boundaries."
 *                        (Embedded into description because the regions
 *                        table has no separate `note` column — see
 *                        scaffolding flags.)
 *
 * Narration templates in Phase H must preserve the attribution and the
 * approximate-boundary nuance.
 *
 * STUB — implementation pending user greenlight on scaffolding.
 */
import type { ImportOptions, ImportResult } from '../lib/types.js';
import { emptyResult } from '../lib/types.js';

export async function runImport(opts: ImportOptions): Promise<ImportResult> {
  void opts;
  const result = emptyResult('native-land');
  // TODO: implement
  //   1. GET https://native-land.ca/api/index.php?maps=territories
  //      Cache the JSON response at cache/native_land/territories.json
  //   2. Filter to features intersecting California bbox
  //   3. Build NormalizedRegion per territory:
  //      - description prefixed with attribution + ethics note
  //      - polygon_geojson from feature.geometry
  //   4. Respect rate limits — Native Land's guidance says "be respectful";
  //      treat as ~1 req/30s
  //   5. Upsert via upsertRegions
  throw new Error('native-land: not yet implemented (Phase E1c)');
}
