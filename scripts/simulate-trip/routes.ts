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

export interface RoutePreset {
  id: string;
  display_name: string;
  origin: string;
  destination: string;
  waypoints: Waypoint[];
  speed_profile: SpeedBreakpoint[];
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
  notes:
    "I-5 → CA-14 → US-395 corridor. Exercises LA Basin → Mojave → Owens Valley → Long Valley Caldera region transitions, soul-doctrine flagship POIs (missions early, geology late), and the cluster-suppression mode-dependent significance rule across dense LA vs sparse rural corridor.",
};

export const PRESETS: Record<string, RoutePreset> = {
  'la-mammoth': LA_MAMMOTH,
};

export const PRESET_IDS = Object.keys(PRESETS);
