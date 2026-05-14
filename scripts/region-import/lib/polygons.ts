/**
 * Polygon helpers: GeoJSON → PostGIS EWKT MULTIPOLYGON.
 *
 * The live `regions.polygon` column is `geography(MultiPolygon, 4326)`. We
 * always emit a MultiPolygon EWKT (wrapping single Polygons into a 1-element
 * MultiPolygon) and let Postgres parse it via ST_GeogFromText('SRID=4326;…').
 *
 * GeoJSON convention: coordinates are [lon, lat] (X, Y). We preserve this
 * order in the WKT — PostGIS expects "lon lat" inside each coordinate pair.
 */

const SRID = 4326;

/** Format a single coord pair "lon lat" — PostGIS WKT expects X then Y. */
function fmtCoord(coord: number[]): string {
  const lon = coord[0];
  const lat = coord[1];
  if (typeof lon !== 'number' || typeof lat !== 'number') {
    throw new Error(`Invalid coordinate pair: ${JSON.stringify(coord)}`);
  }
  return `${lon} ${lat}`;
}

/** Ring → "(lon1 lat1, lon2 lat2, …, lon1 lat1)" with closure check. */
function fmtRing(ring: number[][]): string {
  if (ring.length < 4) {
    throw new Error(`Ring needs ≥4 points (closure required); got ${ring.length}`);
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last) throw new Error('Ring has missing endpoints');
  if (first[0] !== last[0] || first[1] !== last[1]) {
    throw new Error(
      `Ring not closed: first ${JSON.stringify(first)} != last ${JSON.stringify(last)}`,
    );
  }
  return `(${ring.map(fmtCoord).join(', ')})`;
}

/** Polygon (outer + optional holes) → "((outer), (hole1), (hole2), …)" */
function fmtPolygon(polygon: number[][][]): string {
  if (polygon.length === 0) throw new Error('Polygon has no rings');
  return `(${polygon.map(fmtRing).join(', ')})`;
}

/**
 * Convert a GeoJSON Polygon or MultiPolygon to EWKT MULTIPOLYGON.
 * Polygons are auto-wrapped as 1-element MultiPolygons so the schema's
 * geography(MultiPolygon, 4326) accepts the result.
 *
 * `sourceSrid` lets callers pass non-WGS84 coordinates (e.g. EPA shapefile
 * in EPSG:5070). The SRID prefix on the EWKT tells PostGIS how to
 * interpret the coords; the upsert helper then ST_Transform's to 4326.
 * Defaults to 4326 for backward compatibility with E1a's CGS feed.
 *
 * Returns a string suitable for `ST_Transform(ST_GeomFromEWKT($1), 4326)`
 * parameter binding.
 */
export function geoJsonToEwktMultiPolygon(
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  sourceSrid = SRID,
): string {
  if (geom.type === 'Polygon') {
    return `SRID=${sourceSrid};MULTIPOLYGON(${fmtPolygon(geom.coordinates)})`;
  }
  if (geom.type === 'MultiPolygon') {
    const polys = geom.coordinates.map(fmtPolygon).join(', ');
    return `SRID=${sourceSrid};MULTIPOLYGON(${polys})`;
  }
  // @ts-expect-error — defensive: bad input
  throw new Error(`Unsupported geometry type: ${geom.type}`);
}

/**
 * Rough sanity check on a GeoJSON polygon. Throws on anything that would
 * make PostGIS reject the WKT. Doesn't catch self-intersections or other
 * topology errors — that's the DB's job (ST_IsValid).
 */
export function validateGeoJsonPolygon(
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): void {
  // Will throw if rings are malformed, coordinates are not [lon, lat] pairs, etc.
  geoJsonToEwktMultiPolygon(geom);
}
