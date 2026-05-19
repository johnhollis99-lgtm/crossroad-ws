/**
 * Small geographic helpers for the trip simulator. Pure functions only;
 * no DB calls. PostGIS handles the heavy lifting (ST_LineLocatePoint,
 * ST_DWithin, ST_Intersection) — these helpers are for client-side
 * computations like total route length and the speed-profile lookup.
 */

import type { Waypoint, SpeedBreakpoint } from './routes.js';

const EARTH_RADIUS_MI = 3958.7613;

/**
 * Haversine distance between two lat/lon points in miles.
 */
export function haversineMi(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(h));
}

/**
 * Total length of a polyline in miles (sum of haversine distances
 * between consecutive waypoints).
 */
export function routeLengthMi(waypoints: Waypoint[]): number {
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    total += haversineMi(waypoints[i - 1]!, waypoints[i]!);
  }
  return total;
}

/**
 * Compute simulated trip-time in minutes for a given mile-from-start,
 * applying a piecewise-constant speed profile.
 *
 * Profile is a list of (mile, mph) breakpoints, sorted by mile. The
 * speed at mile m is the mph of the latest breakpoint with
 * mile_from_start ≤ m. Defaults to 65 mph if profile is empty or m is
 * before the first breakpoint.
 */
export function milesToMinutes(targetMile: number, profile: SpeedBreakpoint[]): number {
  if (targetMile <= 0) return 0;
  const sorted = [...profile].sort((a, b) => a.mile_from_start - b.mile_from_start);
  if (sorted.length === 0) return (targetMile / 65) * 60;

  let elapsedMin = 0;
  let cursor = 0;
  let currentMph = sorted[0]!.mph; // first speed is in effect from mile 0 upward if its breakpoint is at 0
  // If the profile's first breakpoint is > 0, treat mph as 65 from 0 → first breakpoint.
  if ((sorted[0]?.mile_from_start ?? 0) > 0) currentMph = 65;

  for (const bp of sorted) {
    if (bp.mile_from_start >= targetMile) {
      // target falls before this breakpoint — finish under currentMph
      const remaining = targetMile - cursor;
      elapsedMin += (remaining / currentMph) * 60;
      return elapsedMin;
    }
    // advance to bp.mile_from_start at currentMph
    const seg = bp.mile_from_start - cursor;
    if (seg > 0) {
      elapsedMin += (seg / currentMph) * 60;
      cursor = bp.mile_from_start;
    }
    currentMph = bp.mph;
  }
  // target is past the last breakpoint — finish at the last breakpoint's mph
  const remaining = targetMile - cursor;
  elapsedMin += (remaining / currentMph) * 60;
  return elapsedMin;
}

/**
 * Format minutes-from-start as a hh:mm string (e.g. 312 -> "05:12").
 */
export function fmtElapsed(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Sample N intermediate points along a polyline (in lat/lon) at
 * roughly-uniform spacing. Used for region-transition probing.
 *
 * Step is in miles. Returns the dense sequence including the original
 * waypoint endpoints. Linear (great-circle ignored) interpolation —
 * acceptable for short hops (< 50 mi); regions are large enough that
 * fine-grained accuracy doesn't matter for this use.
 */
export function densifyRoute(waypoints: Waypoint[], stepMi: number): { lat: number; lon: number; mile: number }[] {
  const out: { lat: number; lon: number; mile: number }[] = [];
  if (waypoints.length === 0) return out;
  let mileSoFar = 0;
  out.push({ lat: waypoints[0]!.lat, lon: waypoints[0]!.lon, mile: 0 });
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1]!;
    const b = waypoints[i]!;
    const segMi = haversineMi(a, b);
    const steps = Math.max(1, Math.ceil(segMi / stepMi));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const lat = a.lat + (b.lat - a.lat) * t;
      const lon = a.lon + (b.lon - a.lon) * t;
      const mile = mileSoFar + segMi * t;
      out.push({ lat, lon, mile });
    }
    mileSoFar += segMi;
  }
  return out;
}
