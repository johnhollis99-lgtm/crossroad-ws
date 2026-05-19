/**
 * Markdown renderer for the simulation output. Produces the timeline +
 * summary stats document the curator scans to validate queue feel.
 *
 * Format anchored on the curator's spec from the Phase I scope note:
 * each event becomes a `## hh:mm — Mile X, label` heading with the
 * event details below; trailing summary block totals firings,
 * narration time, silence time; appendix lists below-floor POIs.
 */

import { fmtElapsed, type SimulationOutput, type TimelineEvent } from './lookahead.js';
import { haversineMi } from './geo.js';
import type { RoutePreset, Waypoint } from './routes.js';

/**
 * Cumulative-mile position of each waypoint in the preset, for
 * mile-based label lookup on events that lack lat/lon (region entries).
 */
function waypointMiles(waypoints: Waypoint[]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < waypoints.length; i++) {
    out.push(out[i - 1]! + haversineMi(waypoints[i - 1]!, waypoints[i]!));
  }
  return out;
}

function fmtSecondsMmSs(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function fmtMinutesHhMm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function fmtMile(mile: number): string {
  return mile < 10 ? mile.toFixed(1) : Math.round(mile).toString();
}

function eventHeaderLabel(e: TimelineEvent, route: RoutePreset, wpMiles: number[]): string {
  // Trip endpoints: use route preset's named endpoints directly.
  if (e.kind === 'TRIP_START') return route.waypoints[0]?.label ?? route.origin;
  if (e.kind === 'TRIP_END') return route.waypoints[route.waypoints.length - 1]?.label ?? route.destination;

  // For events with lat/lon (POI events), use nearest waypoint by
  // haversine — accurate, picks the right contextual label.
  if (e.lat != null && e.lon != null) {
    let best = '';
    let bestD = Infinity;
    for (const w of route.waypoints) {
      if (w.label == null) continue;
      const d = haversineMi({ lat: w.lat, lon: w.lon }, { lat: e.lat, lon: e.lon });
      if (d < bestD) {
        bestD = d;
        best = w.label;
      }
    }
    return best || '—';
  }

  // For events without lat/lon (REGION_ENTRY, REGION_RATE_LIMITED), use
  // the route waypoint nearest in MILE space — that's what the curator
  // would scan for to orient themselves. Pick the waypoint whose
  // cumulative mile is closest to the event mile.
  let bestIdx = 0;
  let bestDelta = Infinity;
  for (let i = 0; i < route.waypoints.length; i++) {
    const w = route.waypoints[i]!;
    if (w.label == null) continue;
    const delta = Math.abs((wpMiles[i] ?? 0) - e.mile);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIdx = i;
    }
  }
  return route.waypoints[bestIdx]?.label ?? '—';
}

function renderEvent(e: TimelineEvent, route: RoutePreset, wpMiles: number[]): string {
  const time = fmtElapsed(e.minute);
  const mile = fmtMile(e.mile);

  switch (e.kind) {
    case 'TRIP_START': {
      const label = eventHeaderLabel(e, route, wpMiles);
      return [
        `## ${time} — Trip start, ${label}`,
        `_Mile 0_`,
        '',
      ].join('\n');
    }
    case 'TRIP_END': {
      const label = eventHeaderLabel(e, route, wpMiles);
      return [
        `## ${time} — Trip end, ${label}`,
        `_Mile ${mile}_`,
        '',
      ].join('\n');
    }
    case 'REGION_ENTRY': {
      const tier = e.region_significance_tier == null ? '' : ` · tier ${e.region_significance_tier}`;
      const dur = e.narration_est_sec ? ` (${fmtSecondsMmSs(e.narration_est_sec)} est)` : '';
      return [
        `## ${time} — Mile ${mile} — ${eventHeaderLabel(e, route, wpMiles)}`,
        `**[REGION ENTRY]** ${e.region_name} _(${e.region_type}${tier})_`,
        `→ narration${dur}`,
        '',
      ].join('\n');
    }
    case 'REGION_RATE_LIMITED': {
      return [
        `## ${time} — Mile ${mile} — ${eventHeaderLabel(e, route, wpMiles)}`,
        `**[REGION RATE-LIMIT]** suppressed entry into "${e.region_name}" — ${e.suppression_reason}`,
        '',
      ].join('\n');
    }
    case 'POI_FIRED': {
      const sig = `significance=${e.poi_significance}` +
        (e.poi_boost && e.poi_boost > 0 ? `+boost=${e.poi_boost}` : '');
      const eff = e.poi_effective_score != null ? `, effective=${e.poi_effective_score.toFixed(1)}` : '';
      const w = e.poi_narrator_weight != null ? `, narrator_weight=${e.poi_narrator_weight}` : '';
      const off = e.poi_distance_off_route_mi != null ? `, ${e.poi_distance_off_route_mi.toFixed(2)}mi off-route` : '';
      const dur = e.narration_est_sec ? ` (${fmtSecondsMmSs(e.narration_est_sec)} est)` : '';
      const audio = e.narration_url ? `\n→ ${e.narration_url}` : '\n→ _(no cached audio for this POI)_';
      return [
        `## ${time} — Mile ${mile} — ${eventHeaderLabel(e, route, wpMiles)}`,
        `**[POI TRIGGER]** ${sig}${eff}${w}${off}`,
        `→ ${e.poi_name} (${e.poi_category})${dur}${audio}`,
        '',
      ].join('\n');
    }
    case 'POI_SUPPRESSED_CLUSTER': {
      const sig = `significance=${e.poi_significance}` +
        (e.poi_boost && e.poi_boost > 0 ? `+boost=${e.poi_boost}` : '');
      const eff = e.poi_effective_score != null ? `, effective=${e.poi_effective_score.toFixed(1)}` : '';
      return [
        `### ${time} — Mile ${mile} — [SUPPRESSED — cluster] ${e.poi_name} (${e.poi_category})`,
        `_${sig}${eff} · ${e.suppression_reason}_`,
        '',
      ].join('\n');
    }
    case 'POI_SUPPRESSED_GAP': {
      const sig = `significance=${e.poi_significance}` +
        (e.poi_boost && e.poi_boost > 0 ? `+boost=${e.poi_boost}` : '');
      const blocked = e.gap_blocked_by_poi_name ? ` (blocked by ${e.gap_blocked_by_poi_name})` : '';
      return [
        `### ${time} — Mile ${mile} — [SUPPRESSED — density gap] ${e.poi_name} (${e.poi_category})`,
        `_${sig} · ${e.suppression_reason}${blocked}_`,
        '',
      ].join('\n');
    }
    case 'POI_BELOW_FLOOR':
      // Rendered in the appendix only; not in main timeline
      return '';
  }
}

export function renderMarkdown(
  route: RoutePreset,
  output: SimulationOutput,
  meta: {
    pace: string;
    narrator: string;
    audience: string;
    depth: string;
    corridorMi: number;
    timestamp: string;
  },
): string {
  const { events, stats } = output;
  const wpMiles = waypointMiles(route.waypoints);
  const linesIn: string[] = [];

  // Header
  linesIn.push(`# Simulated trip: ${route.display_name}`);
  linesIn.push('');
  linesIn.push(`_Generated: ${meta.timestamp}_`);
  linesIn.push('');
  linesIn.push(
    `Pace: ${meta.pace} · Narrator: ${meta.narrator} · Audience: ${meta.audience} · Depth: ${meta.depth}`,
  );
  linesIn.push(
    `Distance: ${stats.total_trip_minutes > 0 ? `${Math.round(events[events.length - 1]?.mile ?? 0)} mi` : '—'} · Sim duration: ${fmtMinutesHhMm(stats.total_trip_minutes)} · Corridor: ±${meta.corridorMi}mi`,
  );
  linesIn.push('');
  if (route.notes) {
    linesIn.push(`> ${route.notes}`);
    linesIn.push('');
  }

  // Summary stats (also re-listed at the end; here gives the scan-at-a-glance)
  linesIn.push('### At a glance');
  linesIn.push('');
  linesIn.push(`- ${stats.regions_fired} regions narrated, ${stats.regions_rate_limited} rate-limited (of ${stats.regions_intersected} along route)`);
  linesIn.push(`- ${stats.pois_fired} POIs narrated · ${stats.pois_cluster_suppressed} cluster-suppressed · ${stats.pois_gap_suppressed} density-gap-suppressed · ${stats.pois_below_floor} below floor (of ${stats.total_pois_in_corridor} curated in corridor)`);
  linesIn.push(`- ${fmtMinutesHhMm(stats.total_narration_minutes)} narration · ${fmtMinutesHhMm(stats.total_corridor_silence_minutes)} silence (of ${fmtMinutesHhMm(stats.total_trip_minutes)} total)`);
  const narrationPercent = stats.total_trip_minutes > 0
    ? ((stats.total_narration_minutes / stats.total_trip_minutes) * 100).toFixed(1)
    : '0.0';
  linesIn.push(`- Narration airtime ratio: **${narrationPercent}%**`);
  linesIn.push('');
  linesIn.push('---');
  linesIn.push('');

  // Main timeline
  linesIn.push('## Timeline');
  linesIn.push('');
  for (const e of events) {
    const rendered = renderEvent(e, route, wpMiles);
    if (rendered) linesIn.push(rendered);
  }

  // Trailing summary (richer than the header at-a-glance)
  linesIn.push('---');
  linesIn.push('');
  linesIn.push('## Summary');
  linesIn.push('');
  linesIn.push(`- **Total trip duration (simulated):** ${fmtMinutesHhMm(stats.total_trip_minutes)} at the configured speed profile`);
  linesIn.push(`- **Total narration airtime:** ${fmtMinutesHhMm(stats.total_narration_minutes)} (${narrationPercent}% of trip)`);
  linesIn.push(`- **Total corridor silence:** ${fmtMinutesHhMm(stats.total_corridor_silence_minutes)} (${(100 - Number(narrationPercent)).toFixed(1)}% of trip)`);
  linesIn.push('');
  linesIn.push(`- **Regions:** ${stats.regions_intersected} intersect route → ${stats.regions_fired} narrated + ${stats.regions_rate_limited} rate-limited`);
  linesIn.push(`- **POIs:** ${stats.total_pois_in_corridor} in corridor (curated only) → ${stats.pois_fired} narrated + ${stats.pois_cluster_suppressed} cluster-suppressed + ${stats.pois_gap_suppressed} density-gap-suppressed + ${stats.pois_below_floor} below-floor`);
  linesIn.push('');
  linesIn.push('### Suppression-rule firings');
  linesIn.push('');
  linesIn.push(`- Mode-dependent cluster suppression (driving-mode, ≥${3} same-category POIs within 5 corridor-mi): **${stats.pois_cluster_suppressed} POIs suppressed**`);
  linesIn.push(`- Density gap (POIs with sig<75 dropped within 60s of last narration end): **${stats.pois_gap_suppressed} POIs suppressed**`);
  linesIn.push(`- Region rate-limit (≥20 min between region entries): **${stats.regions_rate_limited} regions suppressed**`);
  linesIn.push('');
  linesIn.push('---');
  linesIn.push('');
  linesIn.push('_Phase I.1 MVP simulation. WebSocket emission + mobile UI integration + real GPS arrive in I.3. Narration durations are estimates from cached audio file sizes (Opus ~24 kbps); actual playback durations may vary by ±10%._');
  linesIn.push('');

  return linesIn.join('\n');
}
