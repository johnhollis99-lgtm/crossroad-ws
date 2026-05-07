// Venue Tour classifier — Section 4 of docs/venue-tour-design.md
//
// Two roles:
//   1. detectVenueFromTags(): does this POI's source data describe a CONTAINER
//      (theme park, campus, mission, ...) ? If yes AND a polygon is supplied,
//      mark it as is_venue=true.
//   2. classifyChild(): given an already-imported POI, find the smallest
//      containing venue polygon (or none) and apply the 5 standalone-exception
//      rules. Returns { parent_poi_id, ... } or a "skip" verdict.
//
// Importers call detectVenueFromTags() during normalization (so the new POI
// gets is_venue/venue_type tagged at import time). The standalone backfill
// script (classify-children.ts) calls classifyChild() against every existing
// POI to establish parent_poi_id.

import type { NormalizedPOI, SourceType } from './types.js';

export type VenueType =
  | 'theme_park'
  | 'campus'
  | 'national_park'
  | 'state_park'
  | 'historic_district'
  | 'museum_complex'
  | 'mission'
  | 'cemetery'
  | 'zoo_aquarium'
  | 'estate'
  | 'shopping_district'
  | 'fairground'
  | 'religious_complex'
  | 'industrial_complex';

export interface VenueDetection {
  is_venue: boolean;
  venue_type: VenueType | null;
  /** Confidence in the venue-type classification (0–1). */
  confidence: number;
  /** Why we classified it — useful for review-queue diagnostics. */
  reason: string;
}

/** Lightweight venue record used by the spatial-containment step. */
export interface VenueCatalogEntry {
  id: string;
  name: string;
  venue_type: VenueType;
  /** GeoJSON Polygon ring as [lng,lat] pairs. */
  polygon: GeoJSONPolygon;
  /** Pre-computed area in m² for innermost-wins ordering. Optional. */
  area_m2?: number;
  /** When the venue was imported — used by exception rule #5. */
  imported_at?: string;
}

export interface GeoJSONPolygon {
  type: 'Polygon';
  /** First ring is outer; subsequent rings are holes. */
  coordinates: number[][][];
}

export interface ClassificationCandidate {
  source_type: SourceType;
  /** ISO timestamp of when this POI was imported (rule #5). */
  imported_at?: string;
  /** Length of additional_sources array (rule #2). */
  additional_sources_count?: number;
  /** Confidence score 0–1 (rule #3). */
  confidence_score: number;
  lat: number;
  lng: number;
}

export type StandaloneReason =
  | 'historic_landmark_in_modern_venue'
  | 'multi_source_independent'
  | 'low_confidence_geocoding'
  | 'imported_before_venue';

export interface ClassificationResult {
  /** UUID of containing venue, or null if standalone. */
  parent_poi_id: string | null;
  /** True if this POI itself is a venue container. */
  is_venue: boolean;
  venue_type: VenueType | null;
  /** Why we ended up here — useful for the dry-run report. */
  reason:
    | 'is_venue_self'
    | 'standalone_no_container'
    | 'child_of_venue'
    | StandaloneReason;
  /** When reason is `child_of_venue`, the matched venue's name. */
  matched_venue_name?: string;
}

// ===== detectVenueFromTags ===================================================

/**
 * Source-specific rules from Section 4.2. Returns is_venue=true ONLY when both
 * (a) the source data describes a venue-shaped container, and (b) tags or the
 * caller will later supply a polygon. The polygon-required rule is enforced
 * upstream — detect-from-tags reports the *intent*; the importer downgrades
 * to is_venue=false if no polygon is found (and logs to review queue).
 */
export function detectVenueFromTags(input: {
  source_type: SourceType;
  /** Raw OSM tags (when source_type='osm'). */
  osm_tags?: Record<string, string>;
  /** Wikidata P31 (instance-of) Q-IDs (when source_type='wikidata'). */
  wikidata_p31?: string[];
  /** Polygon area in m² (used by the leisure=park area gate). */
  area_m2?: number;
  /** POI name — used for rule "named cemetery", "named state park". */
  name?: string;
}): VenueDetection {
  const { source_type, osm_tags, wikidata_p31, area_m2, name } = input;

  // ---- OSM tag rules -------------------------------------------------------
  if (source_type === 'osm' && osm_tags) {
    const t = osm_tags;

    if (t['tourism'] === 'theme_park') {
      return v(true, 'theme_park', 0.95, 'osm tourism=theme_park');
    }
    if (t['boundary'] === 'national_park') {
      return v(true, 'national_park', 0.95, 'osm boundary=national_park');
    }
    if (
      t['leisure'] === 'park' &&
      area_m2 !== undefined &&
      area_m2 > 100_000 &&
      !!name
    ) {
      return v(true, 'state_park', 0.7, `osm leisure=park area=${Math.round(area_m2)}m²`);
    }
    if (t['amenity'] === 'university') {
      return v(true, 'campus', 0.9, 'osm amenity=university');
    }
    if (t['tourism'] === 'zoo' || t['tourism'] === 'aquarium') {
      return v(true, 'zoo_aquarium', 0.9, `osm tourism=${t['tourism']}`);
    }
    if (t['historic'] === 'district') {
      return v(true, 'historic_district', 0.85, 'osm historic=district');
    }
    if (
      t['tourism'] === 'museum' &&
      area_m2 !== undefined &&
      area_m2 > 5000
    ) {
      return v(true, 'museum_complex', 0.7, `osm tourism=museum area=${Math.round(area_m2)}m²`);
    }
    if (
      t['historic'] === 'mission' ||
      (t['amenity'] === 'place_of_worship' && t['historic'] === 'mission')
    ) {
      return v(true, 'mission', 0.9, 'osm historic=mission');
    }
    if (t['landuse'] === 'cemetery' && !!name) {
      return v(true, 'cemetery', 0.8, 'osm landuse=cemetery (named)');
    }
  }

  // ---- Wikidata P31 rules --------------------------------------------------
  if (source_type === 'wikidata' && wikidata_p31?.length) {
    const has = (qid: string) => wikidata_p31!.includes(qid);
    if (has('Q2416723')) return v(true, 'theme_park', 0.95, 'wikidata Q2416723 (theme park)');
    if (has('Q46169')) return v(true, 'national_park', 0.95, 'wikidata Q46169 (national park)');
    if (has('Q3918')) return v(true, 'campus', 0.9, 'wikidata Q3918 (university)');
    if (has('Q3914')) return v(true, 'campus', 0.85, 'wikidata Q3914 (high school)');
    if (has('Q1248784')) return v(true, 'cemetery', 0.85, 'wikidata Q1248784 (cemetery)');
    if (has('Q43501')) return v(true, 'zoo_aquarium', 0.9, 'wikidata Q43501 (zoo)');
    if (has('Q1572600')) return v(true, 'mission', 0.9, 'wikidata Q1572600 (Spanish mission)');
    if (has('Q120560')) return v(true, 'mission', 0.85, 'wikidata Q120560 (mission station)');
  }

  return { is_venue: false, venue_type: null, confidence: 0, reason: 'no_match' };
}

function v(is_venue: boolean, t: VenueType, confidence: number, reason: string): VenueDetection {
  return { is_venue, venue_type: t, confidence, reason };
}

// ===== Spatial containment (point-in-polygon) ================================

/** Standard ray-cast point-in-polygon. Polygon is GeoJSON [lng, lat]. */
export function pointInPolygon(lng: number, lat: number, poly: GeoJSONPolygon): boolean {
  const outer = poly.coordinates[0];
  if (!outer || outer.length < 4) return false;

  if (!ringContains(outer, lng, lat)) return false;

  // Holes (inner rings): if the point falls in a hole, it's NOT in the polygon.
  for (let i = 1; i < poly.coordinates.length; i++) {
    const hole = poly.coordinates[i];
    if (hole && ringContains(hole, lng, lat)) return false;
  }
  return true;
}

function ringContains(ring: number[][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const xi = a[0]!, yi = a[1]!;
    const xj = b[0]!, yj = b[1]!;
    const intersect =
      (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Approximate polygon area on the WGS84 sphere (m²). Spherical excess formula. */
export function polygonAreaM2(poly: GeoJSONPolygon): number {
  const outer = poly.coordinates[0];
  if (!outer || outer.length < 4) return 0;
  return Math.abs(ringAreaM2(outer));
}

function ringAreaM2(ring: number[][]): number {
  const R = 6_378_137; // WGS84 equatorial radius in meters
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n - 1; i++) {
    const p1 = ring[i];
    const p2 = ring[i + 1];
    if (!p1 || !p2) continue;
    const x1 = (p1[0]! * Math.PI) / 180;
    const y1 = (p1[1]! * Math.PI) / 180;
    const x2 = (p2[0]! * Math.PI) / 180;
    const y2 = (p2[1]! * Math.PI) / 180;
    area += (x2 - x1) * (2 + Math.sin(y1) + Math.sin(y2));
  }
  return (area * R * R) / 2;
}

// ===== Standalone-exception rules (Section 4.3) ==============================

export interface StandaloneOptions {
  /** When true, skips Rule 5 (`imported_before_venue`). Used for the
   *  initial backfill pass where the freshly-seeded venues have an
   *  imported_at later than every existing POI by definition. */
  allowRetroactive?: boolean;
}

/**
 * Returns null if the POI should become a child, or a reason string if it
 * should stay standalone. All five rules from Section 4.3 are checked.
 */
export function shouldRemainStandalone(
  candidate: ClassificationCandidate,
  venue: VenueCatalogEntry,
  opts: StandaloneOptions = {},
): StandaloneReason | null {
  // Rule 1: NRHP / state_landmark inside theme_park / campus / state_park
  // → historic landmark predates the modern venue
  if (
    (candidate.source_type === 'nrhp' || candidate.source_type === 'state_landmark') &&
    (venue.venue_type === 'theme_park' ||
      venue.venue_type === 'campus' ||
      venue.venue_type === 'state_park')
  ) {
    return 'historic_landmark_in_modern_venue';
  }

  // Rule 2: multi-source verified independent significance.
  // Carve-out: theme_park and zoo_aquarium — inside these venues, multi-source
  // presence usually means OSM + Wikidata both catalogued the ride/exhibit, not
  // that the feature is independently famous. The rule's intent is protecting
  // historic landmarks from retro-claim by modern venues; rides and exhibits
  // are exactly what venue tour mode is meant to surface as children.
  const RULE2_EXCLUDED_VENUE_TYPES: VenueType[] = ['theme_park', 'zoo_aquarium'];
  if (
    !RULE2_EXCLUDED_VENUE_TYPES.includes(venue.venue_type) &&
    (candidate.additional_sources_count ?? 0) >= 2
  ) {
    return 'multi_source_independent';
  }

  // Rule 3: low-confidence geocoding — don't claim uncertain points
  if (candidate.confidence_score < 0.7) {
    return 'low_confidence_geocoding';
  }

  // Rule 4 ("ownership name") is intentionally OFF per spec.
  // "Disneyland Hotel", "Stanford Memorial Church" ARE legitimate children.

  // Rule 5: POI imported before venue existed — safer to not retroactively claim.
  // Disabled in backfill mode (allowRetroactive=true) where the entire venue
  // catalog is being imported fresh against pre-existing POIs.
  if (
    !opts.allowRetroactive &&
    candidate.imported_at &&
    venue.imported_at &&
    new Date(candidate.imported_at).getTime() < new Date(venue.imported_at).getTime()
  ) {
    return 'imported_before_venue';
  }

  return null;
}

// ===== classifyChild (the main backfill entry point) =========================

/**
 * Given a POI candidate and the venue catalog (in-memory list of venue
 * polygons), return the classification. Picks the smallest containing
 * polygon when nested venues match.
 */
export function classifyChild(
  candidate: ClassificationCandidate,
  venues: VenueCatalogEntry[],
  opts: StandaloneOptions = {},
): ClassificationResult {
  // Step 2 (Step 1 — detectVenueFromTags — runs in importers, not here)
  const containing: Array<VenueCatalogEntry & { area: number }> = [];
  for (const v of venues) {
    if (pointInPolygon(candidate.lng, candidate.lat, v.polygon)) {
      const area = v.area_m2 ?? polygonAreaM2(v.polygon);
      containing.push({ ...v, area });
    }
  }

  if (containing.length === 0) {
    return {
      parent_poi_id: null,
      is_venue: false,
      venue_type: null,
      reason: 'standalone_no_container',
    };
  }

  // Step 4 (innermost wins): smallest polygon area
  containing.sort((a, b) => a.area - b.area);
  const venue = containing[0]!;

  // Step 3: standalone-exception rules
  const exception = shouldRemainStandalone(candidate, venue, opts);
  if (exception) {
    return {
      parent_poi_id: null,
      is_venue: false,
      venue_type: null,
      reason: exception,
      matched_venue_name: venue.name,
    };
  }

  return {
    parent_poi_id: venue.id,
    is_venue: false,
    venue_type: null,
    reason: 'child_of_venue',
    matched_venue_name: venue.name,
  };
}

// ===== Convenience: classifyPOI (called by importers after normalization) ====

/**
 * Importer-facing wrapper. Runs Step 1 (tag detection); if not a venue,
 * defers child classification to the classify-children.ts backfill script.
 * Importers use this immediately after building a NormalizedPOI to set the
 * is_venue / venue_type fields at write time.
 */
export function classifyPOI(
  poi: NormalizedPOI,
  signals: {
    osm_tags?: Record<string, string>;
    wikidata_p31?: string[];
    area_m2?: number;
  } = {},
): VenueDetection {
  return detectVenueFromTags({
    source_type: poi.source_type,
    osm_tags: signals.osm_tags,
    wikidata_p31: signals.wikidata_p31,
    area_m2: signals.area_m2,
    name: poi.name,
  });
}
