import { curateRoutePOIs } from '../curateRoutePOIs';
import type { POI } from '../../../../lib/supabase';
import type { LatLng } from '../../geo';

// Fixed reference polyline: 5 mile east-west drag at ~lat 34.0
// Each 0.01° lng ≈ 0.92 km at this latitude, so we lay 6 vertices spanning
// roughly 5.5 mi total (≈ 9 km). Enough to exercise multi-bin binning for
// both driving (1 mi bins) and hiking (0.25 mi bins).
const POLYLINE: LatLng[] = [
  { latitude: 34.0, longitude: -118.00 },
  { latitude: 34.0, longitude: -118.02 },
  { latitude: 34.0, longitude: -118.04 },
  { latitude: 34.0, longitude: -118.06 },
  { latitude: 34.0, longitude: -118.08 },
  { latitude: 34.0, longitude: -118.10 },
];

function makePOI(overrides: Partial<POI> & Pick<POI, 'id'>): POI {
  return {
    id:          overrides.id,
    name:        overrides.name ?? `POI ${overrides.id}`,
    category:    overrides.category ?? 'history',
    lat:         overrides.lat ?? 34.0,
    lng:         overrides.lng ?? -118.05,
    tags:        overrides.tags ?? [],
    significance_score: overrides.significance_score ?? 50,
  };
}

describe('curateRoutePOIs', () => {
  test('empty rawPOIs returns empty curated set + zero pace', () => {
    const r = curateRoutePOIs({
      rawPOIs: [],
      routePolyline: POLYLINE,
      durationMinutes: 60,
      tripMode: 'driving',
      density: 'balanced',
      minRelevance: 0,
      activeCategories: [],
    });
    expect(r.curatedPOIs).toHaveLength(0);
    expect(r.count).toBe(0);
    expect(r.avgPaceMinutes).toBe(0);
  });

  test('activeCategories empty → all categories included', () => {
    const pois = [
      makePOI({ id: 'a', category: 'history', lng: -118.01 }),
      makePOI({ id: 'b', category: 'nature',  lng: -118.05 }),
      makePOI({ id: 'c', category: 'food_drink', lng: -118.09 }),
    ];
    const r = curateRoutePOIs({
      rawPOIs: pois,
      routePolyline: POLYLINE,
      durationMinutes: 60,
      tripMode: 'driving',
      density: 'balanced',
      minRelevance: 0,
      activeCategories: [],
    });
    // 60 min / 4 (driving balanced) = 15 global cap; all 3 POIs in different bins → all 3 survive.
    expect(r.count).toBe(3);
    expect(r.curatedPOIs.map(p => p.id).sort()).toEqual(['a', 'b', 'c']);
  });

  test('activeCategories excludes-all → empty result', () => {
    const pois = [
      makePOI({ id: 'a', category: 'history' }),
      makePOI({ id: 'b', category: 'nature' }),
    ];
    const r = curateRoutePOIs({
      rawPOIs: pois,
      routePolyline: POLYLINE,
      durationMinutes: 60,
      tripMode: 'driving',
      density: 'balanced',
      minRelevance: 0,
      activeCategories: ['architecture'], // matches neither
    });
    expect(r.curatedPOIs).toHaveLength(0);
    expect(r.count).toBe(0);
  });

  test('minRelevance empties when no POI clears the floor', () => {
    const pois = [
      makePOI({ id: 'a', significance_score: 40 }),
      makePOI({ id: 'b', significance_score: 50 }),
      makePOI({ id: 'c', significance_score: 30 }),
    ];
    const r = curateRoutePOIs({
      rawPOIs: pois,
      routePolyline: POLYLINE,
      durationMinutes: 60,
      tripMode: 'driving',
      density: 'balanced',
      minRelevance: 70,
      activeCategories: [],
    });
    expect(r.count).toBe(0);
  });

  test('density tier changes the global cap on the same input', () => {
    // 10 POIs clustered tightly in one bin so per-bin caps don't dominate;
    // but spread enough across bins to exercise per-bin behavior.
    const pois: POI[] = [];
    for (let i = 0; i < 10; i++) {
      pois.push(makePOI({
        id: `p${i}`,
        // Spread across the 5 mi polyline: bins 0..4.
        lng: -118.00 - 0.02 * (i % 5),
        significance_score: 50 + i, // 50..59 — incidental
      }));
    }

    const sparse = curateRoutePOIs({
      rawPOIs: pois,
      routePolyline: POLYLINE,
      durationMinutes: 60,
      tripMode: 'driving',
      density: 'sparse',
      minRelevance: 0,
      activeCategories: [],
    });
    const balanced = curateRoutePOIs({
      rawPOIs: pois,
      routePolyline: POLYLINE,
      durationMinutes: 60,
      tripMode: 'driving',
      density: 'balanced',
      minRelevance: 0,
      activeCategories: [],
    });
    const dense = curateRoutePOIs({
      rawPOIs: pois,
      routePolyline: POLYLINE,
      durationMinutes: 60,
      tripMode: 'driving',
      density: 'dense',
      minRelevance: 0,
      activeCategories: [],
    });

    // Driving global caps at 60 min:
    //   sparse  60/7  = 8 floor
    //   balanced 60/4 = 15 (but binned set is ≤10) → 10
    //   dense   60/2  = 30 (but binned set is ≤10) → 10
    // Per-bin caps (sparse 1, balanced 2, dense 3) shrink the binned set:
    //   sparse:  5 bins × 1 = 5 binned
    //   balanced: 5 bins × 2 = 10 binned (capped by input count)
    //   dense:   5 bins × 3 = 10 binned (capped by input count)
    expect(sparse.count).toBe(5);
    expect(balanced.count).toBe(10);
    expect(dense.count).toBe(10);
    expect(sparse.count).toBeLessThanOrEqual(balanced.count);
    expect(balanced.count).toBeLessThanOrEqual(dense.count);
  });

  test('spatial spreading — many POIs in one bin do not crowd out other bins', () => {
    // 5 POIs clustered tight at lng ≈ -118.005 (bin 0) plus one POI per
    // later bin. Sparse driving (1 per bin) should keep 1 from bin 0 and
    // one from each of the other bins it has, not 5 from bin 0.
    const pois: POI[] = [
      makePOI({ id: 'cluster1', lng: -118.001, significance_score: 90 }),
      makePOI({ id: 'cluster2', lng: -118.002, significance_score: 85 }),
      makePOI({ id: 'cluster3', lng: -118.003, significance_score: 80 }),
      makePOI({ id: 'cluster4', lng: -118.004, significance_score: 75 }),
      makePOI({ id: 'cluster5', lng: -118.005, significance_score: 70 }),
      makePOI({ id: 'far1',     lng: -118.03,  significance_score: 60 }),
      makePOI({ id: 'far2',     lng: -118.06,  significance_score: 55 }),
      makePOI({ id: 'far3',     lng: -118.09,  significance_score: 50 }),
    ];

    const r = curateRoutePOIs({
      rawPOIs: pois,
      routePolyline: POLYLINE,
      durationMinutes: 240,            // 240/7 = 34 global cap (won't bind)
      tripMode: 'driving',
      density: 'sparse',               // 1 per 1-mi bin
      minRelevance: 0,
      activeCategories: [],
    });

    const ids = r.curatedPOIs.map(p => p.id);
    // At most 1 from the cluster (bin 0 — first ~1 mi).
    const clusterPicks = ids.filter(id => id.startsWith('cluster'));
    expect(clusterPicks.length).toBe(1);
    // The highest-significance cluster member should be the survivor.
    expect(clusterPicks[0]).toBe('cluster1');
    // Each of the far POIs should also make it (each in its own bin).
    expect(ids).toEqual(expect.arrayContaining(['far1', 'far2', 'far3']));
  });

  test('hiking tripMode uses 0.25 mi bins', () => {
    // 4 POIs spaced ~0.5 mi apart on a 2 mi hike. Hiking sparse caps at
    // 2 per bin AND 4 global (240/4 default would be 60 but our duration
    // is 60). Each POI lands in its own 0.25 mi bin → all 4 keep.
    const pois = [
      makePOI({ id: 'h1', lng: -118.000, significance_score: 60 }),
      makePOI({ id: 'h2', lng: -118.006, significance_score: 70 }),
      makePOI({ id: 'h3', lng: -118.013, significance_score: 80 }),
      makePOI({ id: 'h4', lng: -118.020, significance_score: 90 }),
    ];
    const r = curateRoutePOIs({
      rawPOIs: pois,
      routePolyline: POLYLINE,
      durationMinutes: 60,
      tripMode: 'hiking',
      density: 'sparse',
      minRelevance: 0,
      activeCategories: [],
    });
    // hiking sparse global cap: 60 / 4 = 15 (won't bind). Per-bin caps
    // (2/bin) won't bind because each POI is in its own bin.
    expect(r.count).toBe(4);
  });

  test('avgPaceMinutes = duration / count', () => {
    const pois = [
      makePOI({ id: 'a', lng: -118.01 }),
      makePOI({ id: 'b', lng: -118.05 }),
      makePOI({ id: 'c', lng: -118.09 }),
    ];
    const r = curateRoutePOIs({
      rawPOIs: pois,
      routePolyline: POLYLINE,
      durationMinutes: 60,
      tripMode: 'driving',
      density: 'balanced',
      minRelevance: 0,
      activeCategories: [],
    });
    expect(r.count).toBe(3);
    expect(r.avgPaceMinutes).toBeCloseTo(20, 5);
  });
});
