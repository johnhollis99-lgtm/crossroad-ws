/**
 * Geometry helpers shared between `app/drive.tsx` and the curation library
 * (`src/lib/curation/`). Lifted from the per-screen copies once both
 * surfaces needed them.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Great-circle distance between two coordinates in meters.
 * Uses the haversine formula on the WGS-84 mean radius.
 */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Arc-length from route start to the closest projected point on the
 * polyline (meters). Used to give POIs a sequential route position for
 * sorting, queue ordering, and curation spatial binning.
 *
 * Returns 0 when the polyline has fewer than 2 points.
 */
export function arcLengthAlongRoute(
  lat: number,
  lng: number,
  polyline: LatLng[],
): number {
  if (polyline.length < 2) return 0;
  let minDist = Infinity;
  let cumulative = 0;
  let bestArc = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i]!;
    const b = polyline[i + 1]!;
    const segLen = haversineM(a.latitude, a.longitude, b.latitude, b.longitude);
    const dx = b.longitude - a.longitude;
    const dy = b.latitude - a.latitude;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0
      ? Math.max(0, Math.min(1, ((lng - a.longitude) * dx + (lat - a.latitude) * dy) / len2))
      : 0;
    const dist = haversineM(lat, lng, a.latitude + t * dy, a.longitude + t * dx);
    if (dist < minDist) {
      minDist = dist;
      bestArc = cumulative + t * segLen;
    }
    cumulative += segLen;
  }
  return bestArc;
}
