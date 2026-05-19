/**
 * Lookahead worker MVP — Phase I.1.
 *
 * Pure function over the pre-fetched corridor data. Takes the full
 * route's POI candidates + region entries + speed profile, applies the
 * addendum §10 ranking pipeline + §10.3 mode-dependent cluster
 * suppression, and emits an ordered timeline of trip events.
 *
 * Rules implemented (v1 scope):
 *
 *   1. Eligibility gate
 *      - editorial_curated = TRUE (already applied at query time — and this
 *        IS the gate, full stop, per the curator's cycle-3 framing: "[+] is
 *        the curator's authority to lift a POI above the floor without
 *        disturbing the underlying significance_score"). The
 *        category_significance_floors are an algorithm-surface filter
 *        applied at export.ts SELECT time, not a runtime gate. Once the
 *        curator has marked a POI editorial_curated=TRUE, the floor is
 *        done its job. So the lookahead does NOT re-apply the floor.
 *      - parent_poi_id IS NULL (drive-by, not venue child — already at query)
 *
 *   2. Effective score
 *      effective_score = (significance_score + editorial_score_boost)
 *                        × narrator_weight[category]
 *      (boost is the curator's explicit lift signal from cycle-3;
 *      multiplied AFTER addition so a +20 boost on a score=80 base
 *      becomes 100 * 1.6 = 160 for a roadside-Americana on narrator_b)
 *
 *   3. Cluster suppression (mode-dependent — driving mode only)
 *      When N >= CLUSTER_MIN_COUNT same-category POIs fall within
 *      CLUSTER_RADIUS_CORRIDOR_MI of each other along the route, only
 *      the top-of-cluster (highest effective_score) entry surfaces.
 *      Suppressed POIs are still in the timeline as [SUPPRESSED] events
 *      so the curator can see what the rule did.
 *
 *   4. Density gap rule (addendum §10.5)
 *      Drop any POI with significance_score < 75 if it would fire within
 *      DENSITY_GAP_SEC of another already-firing POI's end time. Big
 *      POIs (>= 75) override this — they always fire even if close.
 *
 *   5. Region rate-limit (addendum §10 step 3)
 *      First-entry-per-trip is forced to top of queue. Subsequent region
 *      entries within REGION_RATE_LIMIT_MIN of each other are suppressed.
 *
 *   6. Iconic Local Override — v1: SKIP (Phase F not done; no POIs
 *      flagged iconic_local=TRUE).
 *
 * NOT implemented this cycle (deferred to I.2/I.3):
 *   - Pace = Light Touch gap floor (currently always Full Drive)
 *   - Resonance score modifier for Cultural Fabric POIs
 *   - Narrator mid-trip swap re-rank
 *   - WebSocket emission of narration_queued events
 *   - real-time progressive computation (this is whole-trip in one shot)
 */

import { milesToMinutes, fmtElapsed } from './geo.js';
import { weightFor, type NarratorWeights } from './narrator-weights.js';
import type { CorridorPoi, RegionEntry, PoiAudioMeta } from './queries.js';
import type { SpeedBreakpoint } from './routes.js';

// Tunable defaults (per addendum §10.3 + §10.5 + §10 step 3)
export const CLUSTER_MIN_COUNT = 3;
export const CLUSTER_RADIUS_CORRIDOR_MI = 5;
export const CLUSTER_TOP_N_KEPT = 1;
export const DENSITY_GAP_SEC = 60;
export const DENSITY_GAP_SIG_OVERRIDE = 75;
export const REGION_RATE_LIMIT_MIN = 20;
export const GLOBAL_FLOOR_DEFAULT = 70;

// Narration duration estimates (used until we wire actual audio durations
// from storage.objects metadata.size in queries.ts. Mid-range guesses
// from the cycle-3/4 POI run + region prosody arc).
export const POI_DURATION_SEC_DEFAULT = 90;
export const REGION_DURATION_SEC_DEFAULT = 80;

export interface SimulationInput {
  routeLengthMi: number;
  speedProfile: SpeedBreakpoint[];
  corridorPois: CorridorPoi[];
  regionEntries: RegionEntry[];
  categoryFloors: Map<string, number>;
  narratorWeights: NarratorWeights;
  poiAudio: Map<string, PoiAudioMeta>; // poi_id -> audio meta (may be missing)
  config?: {
    clusterMinCount?: number;
    clusterRadiusMi?: number;
    clusterTopNKept?: number;
    densityGapSec?: number;
    densityGapSigOverride?: number;
    regionRateLimitMin?: number;
    globalFloorDefault?: number;
    poiDurationSecDefault?: number;
    regionDurationSecDefault?: number;
  };
}

export type TimelineEventKind =
  | 'TRIP_START'
  | 'REGION_ENTRY'
  | 'REGION_RATE_LIMITED'
  | 'POI_FIRED'
  | 'POI_SUPPRESSED_CLUSTER'
  | 'POI_SUPPRESSED_GAP'
  | 'POI_BELOW_FLOOR'
  | 'TRIP_END';

export interface TimelineEvent {
  kind: TimelineEventKind;
  mile: number;
  minute: number; // simulated minutes from trip start
  // Common payload
  lat?: number;
  lon?: number;
  narration_url?: string;
  narration_est_sec?: number;
  // POI-specific
  poi_id?: string;
  poi_name?: string;
  poi_category?: string;
  poi_significance?: number;
  poi_boost?: number;
  poi_effective_score?: number;
  poi_narrator_weight?: number;
  poi_distance_off_route_mi?: number;
  // Region-specific
  region_id?: string;
  region_name?: string;
  region_type?: string;
  region_significance_tier?: number | null;
  // Suppression context
  suppression_reason?: string;
  cluster_top_poi_id?: string; // for SUPPRESSED_CLUSTER, the surviving cluster top
  gap_blocked_by_poi_id?: string;
  gap_blocked_by_poi_name?: string;
}

export interface SimulationOutput {
  events: TimelineEvent[];
  stats: {
    total_pois_in_corridor: number;
    pois_below_floor: number;
    pois_cluster_suppressed: number;
    pois_gap_suppressed: number;
    pois_fired: number;
    regions_intersected: number;
    regions_rate_limited: number;
    regions_fired: number;
    total_narration_minutes: number;
    total_trip_minutes: number;
    total_corridor_silence_minutes: number;
  };
}

interface ClusterMembership {
  poi_id: string;
  cluster_id: number; // 0 = solo; > 0 means clustered
  is_cluster_top: boolean;
}

/**
 * Group POIs into clusters by category along the route. For each
 * cluster of N >= clusterMinCount within clusterRadiusMi (corridor-
 * distance along route, measured by route_position_fraction *
 * routeLengthMi), only the top clusterTopNKept by effective_score
 * survives. Other POIs in the cluster are flagged as suppressed.
 *
 * The grouping is greedy: walking POIs in route order, whenever the
 * NEXT same-category POI is within clusterRadiusMi of the cluster
 * leader (the earliest one we've started a cluster with), it joins;
 * once we move past clusterRadiusMi from the leader, the cluster
 * closes and a new one may form.
 */
function clusterByCategory(
  pois: Array<CorridorPoi & { mile: number; effective_score: number }>,
  clusterRadiusMi: number,
  clusterMinCount: number,
  clusterTopNKept: number,
): Map<string, ClusterMembership> {
  const out = new Map<string, ClusterMembership>();
  const byCategory = new Map<string, Array<CorridorPoi & { mile: number; effective_score: number }>>();
  for (const p of pois) {
    if (!byCategory.has(p.category_slug)) byCategory.set(p.category_slug, []);
    byCategory.get(p.category_slug)!.push(p);
  }

  let nextClusterId = 1;
  for (const [, members] of byCategory.entries()) {
    members.sort((a, b) => a.mile - b.mile);
    let i = 0;
    while (i < members.length) {
      // Build a cluster starting at members[i]: include subsequent members
      // within clusterRadiusMi of the LEADER (members[i]).
      const leader = members[i]!;
      const cluster: Array<CorridorPoi & { mile: number; effective_score: number }> = [leader];
      let j = i + 1;
      while (j < members.length && (members[j]!.mile - leader.mile) <= clusterRadiusMi) {
        cluster.push(members[j]!);
        j++;
      }
      if (cluster.length >= clusterMinCount) {
        const id = nextClusterId++;
        const sortedByScore = [...cluster].sort((a, b) => b.effective_score - a.effective_score);
        const tops = new Set(sortedByScore.slice(0, clusterTopNKept).map(p => p.id));
        for (const p of cluster) {
          out.set(p.id, { poi_id: p.id, cluster_id: id, is_cluster_top: tops.has(p.id) });
        }
      } else {
        // Not a cluster — every member stays solo (no suppression).
        for (const p of cluster) {
          out.set(p.id, { poi_id: p.id, cluster_id: 0, is_cluster_top: true });
        }
      }
      i = j;
    }
  }
  return out;
}

export function runLookahead(input: SimulationInput): SimulationOutput {
  const cfg = {
    clusterMinCount: input.config?.clusterMinCount ?? CLUSTER_MIN_COUNT,
    clusterRadiusMi: input.config?.clusterRadiusMi ?? CLUSTER_RADIUS_CORRIDOR_MI,
    clusterTopNKept: input.config?.clusterTopNKept ?? CLUSTER_TOP_N_KEPT,
    densityGapSec: input.config?.densityGapSec ?? DENSITY_GAP_SEC,
    densityGapSigOverride: input.config?.densityGapSigOverride ?? DENSITY_GAP_SIG_OVERRIDE,
    regionRateLimitMin: input.config?.regionRateLimitMin ?? REGION_RATE_LIMIT_MIN,
    globalFloorDefault: input.config?.globalFloorDefault ?? GLOBAL_FLOOR_DEFAULT,
    poiDurationSecDefault: input.config?.poiDurationSecDefault ?? POI_DURATION_SEC_DEFAULT,
    regionDurationSecDefault: input.config?.regionDurationSecDefault ?? REGION_DURATION_SEC_DEFAULT,
  };

  const events: TimelineEvent[] = [];
  const totalTripMin = milesToMinutes(input.routeLengthMi, input.speedProfile);

  // Step 1 — trip-start event
  events.push({
    kind: 'TRIP_START',
    mile: 0,
    minute: 0,
  });

  // Step 2 — annotate POIs with mile, effective_score, audio meta.
  // No floor filter: editorial_curated = TRUE is the gate (see header
  // comment §1). Every POI returned by the corridor query is eligible.
  const annotated: Array<CorridorPoi & {
    mile: number;
    minute: number;
    effective_score: number;
    narrator_weight: number;
    audio_url: string | undefined;
    audio_est_sec: number;
  }> = [];
  for (const p of input.corridorPois) {
    const mile = p.route_position_fraction * input.routeLengthMi;
    const minute = milesToMinutes(mile, input.speedProfile);
    const narratorWeight = weightFor(input.narratorWeights, p.category_slug);
    const effective_score =
      (p.significance_score + p.editorial_score_boost) * narratorWeight;
    const audio = input.poiAudio.get(p.id);
    annotated.push({
      ...p,
      mile,
      minute,
      effective_score,
      narrator_weight: narratorWeight,
      audio_url: audio?.url,
      audio_est_sec: audio?.est_duration_sec ?? cfg.poiDurationSecDefault,
    });
  }

  // Step 3 — cluster suppression (per category, along route)
  const clusters = clusterByCategory(
    annotated,
    cfg.clusterRadiusMi,
    cfg.clusterMinCount,
    cfg.clusterTopNKept,
  );

  // Step 4 — merge POI candidates + region entries into chronological
  // event list, applying density gap + region rate-limit at scan time.
  type Cand =
    | { type: 'poi'; mile: number; minute: number; poi: (typeof annotated)[number] }
    | { type: 'region'; mile: number; minute: number; region: RegionEntry };
  const cands: Cand[] = [];
  for (const p of annotated) {
    cands.push({ type: 'poi', mile: p.mile, minute: p.minute, poi: p });
  }
  for (const r of input.regionEntries) {
    const mile = r.entry_fraction * input.routeLengthMi;
    const minute = milesToMinutes(mile, input.speedProfile);
    cands.push({ type: 'region', mile, minute, region: r });
  }
  cands.sort((a, b) => a.minute - b.minute);

  let lastNarrationEndMin = -Infinity;
  let lastNarrationFiredEvent: TimelineEvent | null = null;
  let lastRegionMin = -Infinity;
  let pois_fired = 0;
  let pois_cluster_suppressed = 0;
  let pois_gap_suppressed = 0;
  let regions_fired = 0;
  let regions_rate_limited = 0;
  let total_narration_minutes = 0;

  for (const c of cands) {
    if (c.type === 'region') {
      // Region rate-limit: first entry fires; subsequent within window are suppressed.
      const sinceLast = c.minute - lastRegionMin;
      if (lastRegionMin === -Infinity || sinceLast >= cfg.regionRateLimitMin) {
        const durSec = cfg.regionDurationSecDefault;
        events.push({
          kind: 'REGION_ENTRY',
          mile: c.mile,
          minute: c.minute,
          region_id: c.region.id,
          region_name: c.region.name,
          region_type: c.region.region_type,
          region_significance_tier: c.region.significance_tier,
          narration_est_sec: durSec,
        });
        lastRegionMin = c.minute;
        lastNarrationEndMin = c.minute + durSec / 60;
        regions_fired++;
        total_narration_minutes += durSec / 60;
      } else {
        events.push({
          kind: 'REGION_RATE_LIMITED',
          mile: c.mile,
          minute: c.minute,
          region_id: c.region.id,
          region_name: c.region.name,
          region_type: c.region.region_type,
          suppression_reason: `within ${cfg.regionRateLimitMin}-min rate-limit window (last region ${Math.round(sinceLast * 10) / 10}m ago)`,
        });
        regions_rate_limited++;
      }
    } else {
      const cluster = clusters.get(c.poi.id);
      if (cluster && cluster.cluster_id > 0 && !cluster.is_cluster_top) {
        // Find the cluster-top POI id for context. It's another POI in
        // the same cluster_id with is_cluster_top=true; find the first one.
        let topId: string | undefined;
        for (const [pid, m] of clusters.entries()) {
          if (m.cluster_id === cluster.cluster_id && m.is_cluster_top) {
            topId = pid;
            break;
          }
        }
        events.push({
          kind: 'POI_SUPPRESSED_CLUSTER',
          mile: c.mile,
          minute: c.minute,
          poi_id: c.poi.id,
          poi_name: c.poi.name,
          poi_category: c.poi.category_slug,
          poi_significance: c.poi.significance_score,
          poi_boost: c.poi.editorial_score_boost,
          poi_effective_score: c.poi.effective_score,
          poi_distance_off_route_mi: c.poi.dist_from_route_mi,
          cluster_top_poi_id: topId,
          suppression_reason: `cluster suppression (${c.poi.category_slug}, cluster #${cluster.cluster_id}, ${cfg.clusterMinCount}+ within ${cfg.clusterRadiusMi}mi)`,
        });
        pois_cluster_suppressed++;
        continue;
      }

      // Density gap: drop POIs with raw significance < threshold if
      // they would fire too close to the last narration's end time.
      const sinceLastEndSec = (c.minute - lastNarrationEndMin) * 60;
      if (
        c.poi.significance_score < cfg.densityGapSigOverride &&
        sinceLastEndSec < cfg.densityGapSec
      ) {
        events.push({
          kind: 'POI_SUPPRESSED_GAP',
          mile: c.mile,
          minute: c.minute,
          poi_id: c.poi.id,
          poi_name: c.poi.name,
          poi_category: c.poi.category_slug,
          poi_significance: c.poi.significance_score,
          poi_boost: c.poi.editorial_score_boost,
          poi_effective_score: c.poi.effective_score,
          poi_distance_off_route_mi: c.poi.dist_from_route_mi,
          gap_blocked_by_poi_id: lastNarrationFiredEvent?.poi_id ?? lastNarrationFiredEvent?.region_id,
          gap_blocked_by_poi_name: lastNarrationFiredEvent?.poi_name ?? lastNarrationFiredEvent?.region_name,
          suppression_reason: `density gap (${Math.round(sinceLastEndSec)}s after last narration end; sig ${c.poi.significance_score} < ${cfg.densityGapSigOverride} override floor)`,
        });
        pois_gap_suppressed++;
        continue;
      }

      // Fire.
      const fired: TimelineEvent = {
        kind: 'POI_FIRED',
        mile: c.mile,
        minute: c.minute,
        lat: c.poi.lat,
        lon: c.poi.lon,
        poi_id: c.poi.id,
        poi_name: c.poi.name,
        poi_category: c.poi.category_slug,
        poi_significance: c.poi.significance_score,
        poi_boost: c.poi.editorial_score_boost,
        poi_effective_score: c.poi.effective_score,
        poi_narrator_weight: c.poi.narrator_weight,
        poi_distance_off_route_mi: c.poi.dist_from_route_mi,
        narration_url: c.poi.audio_url,
        narration_est_sec: c.poi.audio_est_sec,
      };
      events.push(fired);
      lastNarrationFiredEvent = fired;
      lastNarrationEndMin = c.minute + c.poi.audio_est_sec / 60;
      pois_fired++;
      total_narration_minutes += c.poi.audio_est_sec / 60;
    }
  }

  // Step 5 — trip-end event
  events.push({
    kind: 'TRIP_END',
    mile: input.routeLengthMi,
    minute: totalTripMin,
  });

  const stats: SimulationOutput['stats'] = {
    total_pois_in_corridor: input.corridorPois.length,
    pois_below_floor: 0, // editorial-gate-as-the-gate; no runtime floor filter
    pois_cluster_suppressed,
    pois_gap_suppressed,
    pois_fired,
    regions_intersected: input.regionEntries.length,
    regions_rate_limited,
    regions_fired,
    total_narration_minutes,
    total_trip_minutes: totalTripMin,
    total_corridor_silence_minutes: totalTripMin - total_narration_minutes,
  };

  return { events, stats };
}

// Re-export for renderer convenience
export { fmtElapsed };
