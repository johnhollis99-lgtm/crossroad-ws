/**
 * E1d — Named valleys and basins.
 *
 * Spec: docs/roadstory-narration-curation-addendum.md §3 + user-approved
 * sketch (2026-05-14) + corrections (third-person prompt, AVA polygons OK,
 * candidate-then-boost workflow).
 *
 * Target: top ~30 narration-worthy named CA valleys and basins, all at
 * significance_tier = 75.
 *
 * Workflow (broken into phases that gate on user review):
 *
 *   Phase 1 — candidate list (separate script):
 *     build-named-valleys-candidates.ts
 *       1. Pull Wikipedia Category:Valleys_of_California members + hardcoded
 *          supplement list (Lake Tahoe Basin, Mono Basin, LA Basin,
 *          Carrizo Plain, Long Valley Caldera, etc.).
 *       2. For each: fetch pageviews_30d (Wikimedia REST monthly) + summary
 *          first sentence (Wikipedia REST `/page/summary/{title}`).
 *       3. Bbox-filter to California using summary coordinates.
 *       4. Sort by pageviews desc, take top ~80.
 *       5. Write markdown table to docs/decisions/2026-05-14-named-valleys-
 *          candidates.md with empty Boost column. Curator fills 0/1/2 per
 *          row by hand, hands back.
 *
 *   Phase 2 — polygon-source verification (this file):
 *     For each of the final top 30 (= pageviews + boost × 10000, top 30):
 *       a. Try OSM Overpass: rel[natural=valley|place=basin][name~/.../] in
 *          CA bbox. If found, tag tier = A. AVA polygons (Napa, Sonoma,
 *          Russian River) explicitly accepted with metadata.polygon_source
 *          = 'osm_ava'. Flag any other admin-polygon-vs-geological cases
 *          for per-row curator decision.
 *       b. If no OSM polygon, try Wikidata SPARQL: P31 valley/basin with
 *          coordinate location + optional area. Build buffered circle from
 *          centroid (5–10 km radius). Tag tier = B, metadata.polygon_source
 *          = 'wikidata_centroid_buffer', metadata.buffer_radius_km.
 *       c. If neither, fall back to editorial GeoJSON at
 *          data/editorial-valleys.geojson (hand-digitized). Tag tier = C.
 *       d. If none of the three, log to region_review_queue.
 *
 *   Phase 3 — dry-run sample generation (gated):
 *     Generate seed text via draftRegionSeedText() (lib/anthropic.ts —
 *     SEED_TEXT_SYSTEM_PROMPT, the canonical third-person factual prompt
 *     locked in for E1b/c/d) for two reference cases: Owens Valley
 *     (Tier-A OSM, contested-history guardrail test) and Long Valley
 *     Caldera (Tier-B Wikidata-buffer fallback test). Stop and wait for
 *     curator approval before generating the other 28.
 *
 *   Phase 4 — live run:
 *     Generate seed text for the other 28, upsert all 30 to public.regions
 *     with significance_tier = 75, source = 'osm'|'wikidata'|'editorial',
 *     source_id = stable per-source key (OSM relation ID, 'Q-number', or
 *     'valley-<kebab>' for editorial).
 *
 * Per-row values at upsert:
 *   region_type        = 'named_valley_or_basin'
 *   significance_tier  = 75
 *   source             = 'osm' | 'wikidata' | 'editorial'
 *   source_id          = source-specific stable key
 *   parent_region_id   = NULL (named valleys are peers of geomorphic
 *                        provinces, not children — see Soul Doctrine
 *                        §1 in the addendum; geology leads on collision)
 *   metadata.polygon_source   = 'osm_natural_valley' | 'osm_place_basin' |
 *                               'osm_ava' | 'osm_np_boundary' |
 *                               'wikidata_centroid_buffer' | 'editorial'
 *   metadata.buffer_radius_km = number (only when wikidata_centroid_buffer)
 *
 * STUB — implementation pending Phase 1 candidate-list approval.
 */
import type { ImportOptions, ImportResult } from '../lib/types.js';

export async function runImport(_opts: ImportOptions): Promise<ImportResult> {
  throw new Error(
    'named-valleys: not yet implemented (Phase E1d). ' +
    'Run scripts/region-import/build-named-valleys-candidates.ts first ' +
    'to generate docs/decisions/2026-05-14-named-valleys-candidates.md, ' +
    'then have curator fill in boost column, then implement Phase 2 ' +
    '(polygon verification) here.',
  );
}
