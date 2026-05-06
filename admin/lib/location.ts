// Supabase returns geography columns as GeoJSON objects; WKT strings may also appear.
// These helpers normalise both into consistent formats.

export function locationToWkt(loc: unknown): string | null {
  if (!loc) return null;
  if (typeof loc === 'object') {
    const g = loc as { type?: string; coordinates?: number[] };
    if (g.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
      return `SRID=4326;POINT(${g.coordinates[0]} ${g.coordinates[1]})`;
    }
  }
  if (typeof loc === 'string') {
    if (loc.startsWith('SRID=')) return loc;
    const wktMatch = loc.match(/POINT\(([^ ]+) ([^ )]+)\)/);
    if (wktMatch) return `SRID=4326;POINT(${wktMatch[1]} ${wktMatch[2]})`;
    try {
      return locationToWkt(JSON.parse(loc));
    } catch { /* not JSON */ }
  }
  return null;
}

// Returns [lng, lat]
export function locationToLngLat(loc: unknown): [number, number] | null {
  if (!loc) return null;
  if (typeof loc === 'object') {
    const g = loc as { type?: string; coordinates?: number[] };
    if (g.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
      return [g.coordinates[0]!, g.coordinates[1]!];
    }
  }
  if (typeof loc === 'string') {
    if (loc.startsWith('SRID=')) {
      const m = loc.match(/POINT\(([^ ]+) ([^ )]+)\)/);
      if (m) return [Number(m[1]), Number(m[2])];
    }
    const m = loc.match(/POINT\(([^ ]+) ([^ )]+)\)/);
    if (m) return [Number(m[1]), Number(m[2])];
    try {
      return locationToLngLat(JSON.parse(loc));
    } catch { /* not JSON */ }
  }
  return null;
}
