/**
 * Curation — picks a "right-sized" set of POIs from a corridor fetch.
 *
 * Drift 5.76. Pure, unit-tested. Inputs are deterministic; no DB / RPC /
 * date-time touch. Lives under `src/lib/curation/` so callers in `app/`,
 * `lib/`, and `scripts/` can all import it without circular concerns.
 *
 * Algorithm (spec B2):
 *   1. Filter by activeCategories (empty array = include all).
 *   2. Filter by significance_score >= minRelevance.
 *   3. Spatial bins along the polyline:
 *        driving — 1 mi
 *        hiking  — 0.25 mi
 *   4. Per-bin cap:
 *        driving: sparse 1, balanced 2, dense 3
 *        hiking:  sparse 2, balanced 5, dense 10
 *   5. Global cap = floor(durationMinutes / divisor):
 *        driving: sparse 7, balanced 4, dense 2
 *        hiking:  sparse 4, balanced 2, dense 1
 *   6. Return top-significance survivors + count + avgPaceMinutes.
 *
 * `rawPOIs` is assumed pre-sorted by significance DESC (RPC supports
 * `sort_mode='significance_desc'` since migration 20260512000002). If the
 * caller hands in distance-sorted data, the function still works — it
 * re-sorts within bins by significance — but the per-bin cap will pick
 * less-relevant POIs because the in-place ordering isn't guaranteed.
 */

import { arcLengthAlongRoute, type LatLng } from '../geo';
import type { POI } from '../../../lib/supabase';

export type TripMode = 'driving' | 'hiking';
export type Density  = 'sparse' | 'balanced' | 'dense';

export interface CurationInput {
  rawPOIs: POI[];
  routePolyline: LatLng[];
  /** Trip duration in minutes; powers the global cap and the avgPace return. */
  durationMinutes: number;
  tripMode: TripMode;
  density: Density;
  /** 0–100. POIs with significance_score < minRelevance are dropped. */
  minRelevance: number;
  /** DB category slugs. Empty array = include all categories. */
  activeCategories: string[];
}

export interface CurationOutput {
  curatedPOIs: POI[];
  count: number;
  /** Average minutes between curated POIs given the trip duration. 0 when count=0. */
  avgPaceMinutes: number;
}

// Meters per mile. Single source rather than 1609.34 sprinkled around.
const METERS_PER_MILE = 1609.34;

const BIN_SIZE_MI: Record<TripMode, number> = {
  driving: 1,
  hiking:  0.25,
};

const PER_BIN_CAP: Record<TripMode, Record<Density, number>> = {
  driving: { sparse: 1, balanced: 2, dense: 3 },
  hiking:  { sparse: 2, balanced: 5, dense: 10 },
};

const GLOBAL_CAP_DIVISOR: Record<TripMode, Record<Density, number>> = {
  driving: { sparse: 7, balanced: 4, dense: 2 },
  hiking:  { sparse: 4, balanced: 2, dense: 1 },
};

export function curateRoutePOIs(input: CurationInput): CurationOutput {
  const {
    rawPOIs, routePolyline, durationMinutes, tripMode, density,
    minRelevance, activeCategories,
  } = input;

  // 1 + 2 — category and relevance filters.
  const catSet = new Set(activeCategories);
  const filtered = rawPOIs.filter(p => {
    if (catSet.size > 0 && !catSet.has(p.category)) return false;
    const score = p.significance_score ?? 0;
    return score >= minRelevance;
  });

  // 3 — spatial binning. arcLengthAlongRoute returns meters from the
  // start of the polyline; we bin by floor(arc / binSizeM).
  const binSizeM = BIN_SIZE_MI[tripMode] * METERS_PER_MILE;
  const bins = new Map<number, POI[]>();
  for (const p of filtered) {
    const arc = arcLengthAlongRoute(p.lat, p.lng, routePolyline);
    const binIdx = Math.floor(arc / binSizeM);
    let bin = bins.get(binIdx);
    if (!bin) {
      bin = [];
      bins.set(binIdx, bin);
    }
    bin.push(p);
  }

  // 4 — per-bin cap. Sort each bin by significance DESC (defensive — the
  // input is "pre-sorted" but the contract holds even if the caller breaks
  // that), then keep the top `perBinCap` per bin.
  const perBinCap = PER_BIN_CAP[tripMode][density];
  const binned: POI[] = [];
  for (const arr of bins.values()) {
    arr.sort((a, b) => (b.significance_score ?? 0) - (a.significance_score ?? 0));
    for (let i = 0; i < Math.min(perBinCap, arr.length); i++) {
      binned.push(arr[i]!);
    }
  }

  // 5 — global cap. floor(duration / divisor), with a floor of 1 to
  // prevent zero-POI trips on very short routes (divisor=7, duration=5
  // would otherwise produce a global cap of 0).
  const divisor   = GLOBAL_CAP_DIVISOR[tripMode][density];
  const globalCap = Math.max(1, Math.floor(durationMinutes / divisor));

  // 6 — top-significance across the binned set. The per-bin pass already
  // ensured spatial spread; the global cap trims by relevance from there.
  binned.sort((a, b) => (b.significance_score ?? 0) - (a.significance_score ?? 0));
  const curatedPOIs = binned.slice(0, globalCap);

  const count          = curatedPOIs.length;
  const avgPaceMinutes = count > 0 ? durationMinutes / count : 0;

  return { curatedPOIs, count, avgPaceMinutes };
}
