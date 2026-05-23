/**
 * Preset routes for the trip simulator.
 *
 * Each route is a list of major waypoints along the actual road corridor.
 * The simulator densifies between consecutive waypoints via straight-line
 * interpolation at simulated 1km steps for region-transition detection.
 * Waypoints are spaced closely enough (every ~10-30 mi on highways,
 * tighter through interchanges) that straight-line interpolation stays
 * roughly on-corridor.
 *
 * Speed profile is a list of (mile-from-start, mph) breakpoints. The
 * simulator linearly applies the latest active speed at each mile to
 * compute simulated time. Defaults to highway 65 mph if a route omits
 * speed_profile.
 *
 * To add a new route: append to the PRESETS map with a stable kebab-case
 * id. Update PRESET_IDS for the CLI --route flag completion.
 */

export interface Waypoint {
  lat: number;
  lon: number;
  label?: string; // optional inline note (e.g. "I-5/CA-14 split")
}

export interface SpeedBreakpoint {
  mile_from_start: number;
  mph: number;
}

/**
 * One urban (denser POI catalog) override segment along a route. The
 * lookahead's per-mile filter uses corridor_mi as the spatial cap
 * inside [start_mile, end_mile).
 */
export interface CorridorSegment {
  start_mile: number;   // inclusive
  end_mile: number;     // exclusive
  corridor_mi: number;  // half-width in miles
  label: string;        // human label for logs
}

/**
 * Per-route corridor profile. The lookahead applies default_corridor_mi
 * everywhere except inside urban_segments, where the segment's narrower
 * corridor_mi wins. closest_approach POIs are exempt from the profile
 * and instead capped at CLOSEST_APPROACH_MAX_MI in the lookahead.
 */
export interface CorridorProfile {
  default_corridor_mi: number;
  urban_segments: CorridorSegment[];
  notes?: string;
}

export interface RoutePreset {
  id: string;
  display_name: string;
  origin: string;
  destination: string;
  waypoints: Waypoint[];
  speed_profile: SpeedBreakpoint[];
  corridor_profile?: CorridorProfile;
  notes?: string;
}

const LA_MAMMOTH: RoutePreset = {
  id: 'la-mammoth',
  display_name: 'Los Angeles → Mammoth Lakes',
  origin: 'Los Angeles, CA',
  destination: 'Mammoth Lakes, CA',
  waypoints: [
    { lat: 34.0522, lon: -118.2437, label: 'Downtown LA' },
    { lat: 34.1840, lon: -118.3260, label: 'I-5 / Burbank' },
    { lat: 34.3061, lon: -118.4501, label: 'Sylmar' },
    { lat: 34.3650, lon: -118.5050, label: 'I-5 / CA-14 split (Newhall Pass)' },
    { lat: 34.4700, lon: -118.1968, label: 'Acton (CA-14)' },
    { lat: 34.5794, lon: -118.1165, label: 'Palmdale' },
    { lat: 34.6868, lon: -118.1542, label: 'Lancaster' },
    { lat: 35.0525, lon: -118.1739, label: 'Mojave (CA-14/US-58 jct)' },
    { lat: 35.4660, lon: -117.9080, label: 'Red Rock Canyon SP area' },
    { lat: 35.6481, lon: -117.8211, label: 'Inyokern (CA-14 → US-395)' },
    { lat: 35.7600, lon: -117.8800, label: 'Pearsonville' },
    { lat: 36.2880, lon: -118.0011, label: 'Olancha' },
    { lat: 36.6063, lon: -118.0593, label: 'Lone Pine' },
    { lat: 36.8027, lon: -118.2003, label: 'Independence' },
    { lat: 37.1652, lon: -118.2916, label: 'Big Pine' },
    { lat: 37.3635, lon: -118.3953, label: 'Bishop' },
    { lat: 37.5650, lon: -118.6700, label: "Tom's Place" },
    { lat: 37.6500, lon: -118.7400, label: 'Crowley Lake' },
    { lat: 37.6485, lon: -118.9712, label: 'US-395 / CA-203 (Mammoth jct)' },
    { lat: 37.6485, lon: -118.9721, label: 'Mammoth Lakes' },
  ],
  speed_profile: [
    { mile_from_start:   0, mph: 35 },  // LA urban → I-5 → CA-14 jct
    { mile_from_start:  25, mph: 65 },  // CA-14 north + US-395 corridor
    { mile_from_start: 295, mph: 35 },  // approach + Mammoth town
  ],
  corridor_profile: {
    default_corridor_mi: 25,
    urban_segments: [
      { start_mile:   0, end_mile:  27, corridor_mi: 10, label: 'LA basin'    },
      { start_mile: 290, end_mile: 297, corridor_mi: 10, label: 'Mammoth town' },
    ],
    notes:
      "Rural Eastern Sierra needs the wider corridor to catch Mt. Whitney, Bristlecone, Trona, Kennedy Meadows. Urban LA basin keeps 10mi to avoid POI saturation.",
  },
  notes:
    "I-5 → CA-14 → US-395 corridor. Exercises LA Basin → Mojave → Owens Valley → Long Valley Caldera region transitions, soul-doctrine flagship POIs (missions early, geology late), and the cluster-suppression mode-dependent significance rule across dense LA vs sparse rural corridor.",
};

export const PRESETS: Record<string, RoutePreset> = {
  'la-mammoth': LA_MAMMOTH,
};

export const PRESET_IDS = Object.keys(PRESETS);

/**
 * Maximum perpendicular distance (miles) at which a closest_approach POI
 * is still considered visible from the route. Used by the lookahead's
 * per-mile filter and by getMaxCorridorMi to widen the SQL spatial filter.
 */
export const CLOSEST_APPROACH_MAX_MI = 30;

/**
 * Returns the corridor half-width (miles) at a given mile along the route.
 * Linear scan of urban_segments — always small N. First match wins; falls
 * back to default_corridor_mi outside any urban segment.
 *
 * Throws if the route has no corridor_profile (every route consumed by the
 * per-mile filter must define one).
 */
export function getCorridorMiAt(route: RoutePreset, mile: number): number {
  const profile = route.corridor_profile;
  if (!profile) {
    throw new Error(`getCorridorMiAt: route "${route.id}" has no corridor_profile`);
  }
  for (const seg of profile.urban_segments) {
    if (mile >= seg.start_mile && mile < seg.end_mile) {
      return seg.corridor_mi;
    }
  }
  return profile.default_corridor_mi;
}

/**
 * Returns the widest corridor the SQL spatial filter must cover for this
 * route — the max of (default_corridor_mi, every urban_segment.corridor_mi,
 * CLOSEST_APPROACH_MAX_MI). Pass this into getCorridorPois so closest_approach
 * candidates inside the 30mi cap come back from the DB even when the
 * route's rural corridor is narrower than 30.
 */
export function getMaxCorridorMi(route: RoutePreset): number {
  const profile = route.corridor_profile;
  if (!profile) return CLOSEST_APPROACH_MAX_MI;
  let max = Math.max(profile.default_corridor_mi, CLOSEST_APPROACH_MAX_MI);
  for (const seg of profile.urban_segments) {
    if (seg.corridor_mi > max) max = seg.corridor_mi;
  }
  return max;
}
