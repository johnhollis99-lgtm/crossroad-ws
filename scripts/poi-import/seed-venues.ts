#!/usr/bin/env node
// Venue seed script — Section 8 of docs/venue-tour-design.md.
//
// Fetches polygons for ~80 California venues (theme parks, national/state
// parks, missions, campuses, historic districts, museums, zoos, cemeteries)
// from OpenStreetMap via Overpass. Each venue carries a Wikidata QID as its
// stable lookup key; if the QID lookup yields nothing we fall back to a
// name + tag search.
//
// Output:
//   --dry-run : prints success/failure counts and writes a JSON catalog
//               (cache/venues-catalog-{ts}.json) the classifier can load.
//   live      : upserts the venues into pois with is_venue=true and writes
//               a row per failed-polygon-lookup into venue_classification_review.
//
// Run from scripts/poi-import/ :
//   npx tsx seed-venues.ts --dry-run
//   npx tsx seed-venues.ts                 # live
//   npx tsx seed-venues.ts --only=missions # filter by group

import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, '../../.env') });

import { promises as fs } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { Command } from 'commander';
import { getAdminClient, getCategoryIdMap, getPgPool } from './lib/supabase.js';
import type { VenueType, GeoJSONPolygon } from './lib/classify-poi.js';
import { polygonAreaM2 } from './lib/classify-poi.js';

// ===== Venue catalog (Section 8 of design doc) ===============================

interface VenueSpec {
  slug: string;
  name: string;
  venue_type: VenueType;
  /** Wikidata Q-ID — primary lookup key. */
  wikidata?: string;
  /** Fallback OSM tags for name-based query when QID lookup fails. */
  osm_tag?: { key: string; value: string };
  group: string;
}

const VENUES: VenueSpec[] = [
  // 8.1 Theme parks (9)
  { slug: 'disneyland-park',           name: 'Disneyland Park',                wikidata: 'Q172041',  osm_tag: { key: 'tourism', value: 'theme_park' }, venue_type: 'theme_park', group: 'theme_parks' },
  { slug: 'disney-california-adventure', name: 'Disney California Adventure Park', wikidata: 'Q521652', osm_tag: { key: 'tourism', value: 'theme_park' }, venue_type: 'theme_park', group: 'theme_parks' },
  { slug: 'universal-studios-hollywood', name: 'Universal Studios Hollywood',  wikidata: 'Q170532',  osm_tag: { key: 'tourism', value: 'theme_park' }, venue_type: 'theme_park', group: 'theme_parks' },
  { slug: 'knotts-berry-farm',          name: "Knott's Berry Farm",            wikidata: 'Q587258',  osm_tag: { key: 'tourism', value: 'theme_park' }, venue_type: 'theme_park', group: 'theme_parks' },
  { slug: 'six-flags-magic-mountain',   name: 'Six Flags Magic Mountain',      wikidata: 'Q1378390', osm_tag: { key: 'tourism', value: 'theme_park' }, venue_type: 'theme_park', group: 'theme_parks' },
  { slug: 'six-flags-discovery-kingdom', name: 'Six Flags Discovery Kingdom',  wikidata: 'Q1378403', osm_tag: { key: 'tourism', value: 'theme_park' }, venue_type: 'theme_park', group: 'theme_parks' },
  { slug: 'californias-great-america',  name: "California's Great America",    wikidata: 'Q733596',  osm_tag: { key: 'tourism', value: 'theme_park' }, venue_type: 'theme_park', group: 'theme_parks' },
  { slug: 'legoland-california',        name: 'Legoland California',           wikidata: 'Q1813276', osm_tag: { key: 'tourism', value: 'theme_park' }, venue_type: 'theme_park', group: 'theme_parks' },
  { slug: 'seaworld-san-diego',         name: 'SeaWorld San Diego',            wikidata: 'Q1130773', osm_tag: { key: 'tourism', value: 'theme_park' }, venue_type: 'theme_park', group: 'theme_parks' },

  // 8.2 National parks (9)
  { slug: 'yosemite-np',         name: 'Yosemite National Park',          wikidata: 'Q758',    osm_tag: { key: 'boundary', value: 'national_park' }, venue_type: 'national_park', group: 'national_parks' },
  { slug: 'sequoia-np',          name: 'Sequoia National Park',           wikidata: 'Q220957', osm_tag: { key: 'boundary', value: 'national_park' }, venue_type: 'national_park', group: 'national_parks' },
  { slug: 'kings-canyon-np',     name: 'Kings Canyon National Park',      wikidata: 'Q49348',  osm_tag: { key: 'boundary', value: 'national_park' }, venue_type: 'national_park', group: 'national_parks' },
  { slug: 'death-valley-np',     name: 'Death Valley National Park',      wikidata: 'Q170099', osm_tag: { key: 'boundary', value: 'national_park' }, venue_type: 'national_park', group: 'national_parks' },
  { slug: 'joshua-tree-np',      name: 'Joshua Tree National Park',       wikidata: 'Q49273',  osm_tag: { key: 'boundary', value: 'national_park' }, venue_type: 'national_park', group: 'national_parks' },
  { slug: 'lassen-volcanic-np',  name: 'Lassen Volcanic National Park',   wikidata: 'Q272629', osm_tag: { key: 'boundary', value: 'national_park' }, venue_type: 'national_park', group: 'national_parks' },
  { slug: 'pinnacles-np',        name: 'Pinnacles National Park',         wikidata: 'Q570103', osm_tag: { key: 'boundary', value: 'national_park' }, venue_type: 'national_park', group: 'national_parks' },
  { slug: 'channel-islands-np',  name: 'Channel Islands National Park',   wikidata: 'Q272611', osm_tag: { key: 'boundary', value: 'national_park' }, venue_type: 'national_park', group: 'national_parks' },
  { slug: 'redwood-np',          name: 'Redwood National and State Parks', wikidata: 'Q172303', osm_tag: { key: 'boundary', value: 'national_park' }, venue_type: 'national_park', group: 'national_parks' },

  // 8.3 Major state parks (7)
  { slug: 'anza-borrego-sp',     name: 'Anza-Borrego Desert State Park',  wikidata: 'Q606878', venue_type: 'state_park', group: 'state_parks' },
  { slug: 'henry-cowell-sp',     name: 'Henry Cowell Redwoods State Park', wikidata: 'Q5717237', venue_type: 'state_park', group: 'state_parks' },
  { slug: 'pfeiffer-big-sur-sp', name: 'Pfeiffer Big Sur State Park',     wikidata: 'Q1545412', venue_type: 'state_park', group: 'state_parks' },
  { slug: 'andrew-molera-sp',    name: 'Andrew Molera State Park',        wikidata: 'Q4754472', venue_type: 'state_park', group: 'state_parks' },
  { slug: 'mt-tam-sp',           name: 'Mount Tamalpais State Park',      wikidata: 'Q961625', venue_type: 'state_park', group: 'state_parks' },
  { slug: 'crystal-cove-sp',     name: 'Crystal Cove State Park',         wikidata: 'Q5193879', venue_type: 'state_park', group: 'state_parks' },
  { slug: 'hearst-san-simeon-shp', name: 'Hearst San Simeon State Historical Monument', wikidata: 'Q5694931', venue_type: 'state_park', group: 'state_parks' },

  // 8.4 Spanish missions (21)
  { slug: 'mission-san-diego',         name: 'Mission San Diego de Alcalá',           wikidata: 'Q1825849', venue_type: 'mission', group: 'missions' },
  { slug: 'mission-san-carlos-carmel', name: 'Mission San Carlos Borromeo de Carmelo', wikidata: 'Q1502796', venue_type: 'mission', group: 'missions' },
  { slug: 'mission-san-antonio',       name: 'Mission San Antonio de Padua',           wikidata: 'Q1825834', venue_type: 'mission', group: 'missions' },
  { slug: 'mission-san-gabriel',       name: 'Mission San Gabriel Arcángel',           wikidata: 'Q1825852', venue_type: 'mission', group: 'missions' },
  { slug: 'mission-san-luis-obispo',   name: 'Mission San Luis Obispo de Tolosa',     wikidata: 'Q1825880', venue_type: 'mission', group: 'missions' },
  { slug: 'mission-san-francisco-asis', name: 'Mission San Francisco de Asís',        wikidata: 'Q1825855', venue_type: 'mission', group: 'missions' },
  { slug: 'mission-san-juan-capistrano', name: 'Mission San Juan Capistrano',         wikidata: 'Q1825876', venue_type: 'mission', group: 'missions' },
  { slug: 'mission-santa-clara',       name: 'Mission Santa Clara de Asís',           wikidata: 'Q1825907', venue_type: 'mission', group: 'missions' },
  { slug: 'mission-san-buenaventura',  name: 'Mission San Buenaventura',              wikidata: 'Q1825841', venue_type: 'mission', group: 'missions' },
  { slug: 'mission-santa-barbara',     name: 'Mission Santa Bárbara',                 wikidata: 'Q1825905', venue_type: 'mission', group: 'missions' },
  { slug: 'mission-la-purisima',       name: 'Mission La Purísima Concepción',        wikidata: 'Q1815443', venue_type: 'mission', group: 'missions' },
  { slug: 'mission-santa-cruz',        name: 'Mission Santa Cruz',                    wikidata: 'Q1825909', venue_type: 'mission', group: 'missions' },
  { slug: 'mission-soledad',           name: 'Mission Nuestra Señora de la Soledad',  wikidata: 'Q1830014', venue_type: 'mission', group: 'missions' },
  { slug: 'mission-san-jose',          name: 'Mission San José',                      wikidata: 'Q1825866', venue_type: 'mission', group: 'missions' },
  { slug: 'mission-san-juan-bautista', name: 'Mission San Juan Bautista',             wikidata: 'Q1825870', venue_type: 'mission', group: 'missions' },
  { slug: 'mission-san-miguel',        name: 'Mission San Miguel Arcángel',           wikidata: 'Q1825883', venue_type: 'mission', group: 'missions' },
  { slug: 'mission-san-fernando',      name: 'Mission San Fernando Rey de España',    wikidata: 'Q1825848', venue_type: 'mission', group: 'missions' },
  { slug: 'mission-san-luis-rey',      name: 'Mission San Luis Rey de Francia',       wikidata: 'Q1825890', venue_type: 'mission', group: 'missions' },
  { slug: 'mission-santa-ines',        name: 'Mission Santa Inés',                    wikidata: 'Q1825912', venue_type: 'mission', group: 'missions' },
  { slug: 'mission-san-rafael',        name: 'Mission San Rafael Arcángel',           wikidata: 'Q1825900', venue_type: 'mission', group: 'missions' },
  { slug: 'mission-solano',            name: 'Mission San Francisco Solano',          wikidata: 'Q1825862', venue_type: 'mission', group: 'missions' },

  // 8.5 University campuses (10)
  { slug: 'uc-berkeley',  name: 'University of California, Berkeley',     wikidata: 'Q168756',  osm_tag: { key: 'amenity', value: 'university' }, venue_type: 'campus', group: 'campuses' },
  { slug: 'stanford',     name: 'Stanford University',                    wikidata: 'Q41506',   osm_tag: { key: 'amenity', value: 'university' }, venue_type: 'campus', group: 'campuses' },
  { slug: 'ucla',         name: 'University of California, Los Angeles',  wikidata: 'Q174710',  osm_tag: { key: 'amenity', value: 'university' }, venue_type: 'campus', group: 'campuses' },
  { slug: 'usc',          name: 'University of Southern California',      wikidata: 'Q4614',    osm_tag: { key: 'amenity', value: 'university' }, venue_type: 'campus', group: 'campuses' },
  { slug: 'caltech',      name: 'California Institute of Technology',     wikidata: 'Q161562',  osm_tag: { key: 'amenity', value: 'university' }, venue_type: 'campus', group: 'campuses' },
  { slug: 'ucsd',         name: 'University of California, San Diego',    wikidata: 'Q622664',  osm_tag: { key: 'amenity', value: 'university' }, venue_type: 'campus', group: 'campuses' },
  { slug: 'uc-davis',     name: 'University of California, Davis',        wikidata: 'Q1419768', osm_tag: { key: 'amenity', value: 'university' }, venue_type: 'campus', group: 'campuses' },
  { slug: 'ucsb',         name: 'University of California, Santa Barbara', wikidata: 'Q838330', osm_tag: { key: 'amenity', value: 'university' }, venue_type: 'campus', group: 'campuses' },
  { slug: 'uc-irvine',    name: 'University of California, Irvine',       wikidata: 'Q1190209', osm_tag: { key: 'amenity', value: 'university' }, venue_type: 'campus', group: 'campuses' },
  { slug: 'uc-santa-cruz', name: 'University of California, Santa Cruz', wikidata: 'Q1419766', osm_tag: { key: 'amenity', value: 'university' }, venue_type: 'campus', group: 'campuses' },

  // 8.6 Historic districts (7)
  { slug: 'olvera-street',    name: 'El Pueblo de Los Angeles Historical Monument', wikidata: 'Q1264783', venue_type: 'historic_district', group: 'historic_districts' },
  { slug: 'old-town-sd',      name: 'Old Town San Diego State Historic Park',       wikidata: 'Q4180498', venue_type: 'historic_district', group: 'historic_districts' },
  { slug: 'chinatown-sf',     name: 'Chinatown, San Francisco',                     wikidata: 'Q261229',  venue_type: 'historic_district', group: 'historic_districts' },
  { slug: 'japantown-sf',     name: 'Japantown, San Francisco',                     wikidata: 'Q1701748', venue_type: 'historic_district', group: 'historic_districts' },
  { slug: 'old-pasadena',     name: 'Old Pasadena',                                 wikidata: 'Q7083268', venue_type: 'historic_district', group: 'historic_districts' },
  { slug: 'sutters-fort',     name: "Sutter's Fort State Historic Park",            wikidata: 'Q904619',  venue_type: 'historic_district', group: 'historic_districts' },
  { slug: 'bodie-shp',        name: 'Bodie State Historic Park',                    wikidata: 'Q888057',  venue_type: 'historic_district', group: 'historic_districts' },

  // 8.7 Museum complexes (7)
  { slug: 'getty-center',         name: 'Getty Center',                              wikidata: 'Q731126',  venue_type: 'museum_complex', group: 'museums' },
  { slug: 'getty-villa',          name: 'Getty Villa',                               wikidata: 'Q731127',  venue_type: 'museum_complex', group: 'museums' },
  { slug: 'huntington-library',   name: 'Huntington Library, Art Museum and Botanical Gardens', wikidata: 'Q499617', venue_type: 'museum_complex', group: 'museums' },
  { slug: 'hearst-castle',        name: 'Hearst Castle',                             wikidata: 'Q1264793', venue_type: 'museum_complex', group: 'museums' },
  { slug: 'balboa-park',          name: 'Balboa Park',                               wikidata: 'Q815722',  venue_type: 'museum_complex', group: 'museums' },
  { slug: 'exposition-park-la',   name: 'Exposition Park (Los Angeles)',             wikidata: 'Q5421159', venue_type: 'museum_complex', group: 'museums' },
  { slug: 'sf-maritime-nhp',      name: 'San Francisco Maritime National Historical Park', wikidata: 'Q1369301', venue_type: 'museum_complex', group: 'museums' },

  // 8.8 Zoos & aquariums (8)
  { slug: 'la-zoo',                name: 'Los Angeles Zoo',                wikidata: 'Q1546973', osm_tag: { key: 'tourism', value: 'zoo' },      venue_type: 'zoo_aquarium', group: 'zoos' },
  { slug: 'sd-zoo',                name: 'San Diego Zoo',                  wikidata: 'Q207678',  osm_tag: { key: 'tourism', value: 'zoo' },      venue_type: 'zoo_aquarium', group: 'zoos' },
  { slug: 'sd-zoo-safari-park',    name: 'San Diego Zoo Safari Park',      wikidata: 'Q5634115', osm_tag: { key: 'tourism', value: 'zoo' },      venue_type: 'zoo_aquarium', group: 'zoos' },
  { slug: 'monterey-bay-aquarium', name: 'Monterey Bay Aquarium',          wikidata: 'Q1576099', osm_tag: { key: 'tourism', value: 'aquarium' }, venue_type: 'zoo_aquarium', group: 'zoos' },
  { slug: 'aquarium-of-the-pacific', name: 'Aquarium of the Pacific',      wikidata: 'Q616534',  osm_tag: { key: 'tourism', value: 'aquarium' }, venue_type: 'zoo_aquarium', group: 'zoos' },
  { slug: 'birch-aquarium',        name: 'Birch Aquarium',                 wikidata: 'Q4915184', osm_tag: { key: 'tourism', value: 'aquarium' }, venue_type: 'zoo_aquarium', group: 'zoos' },
  { slug: 'sf-zoo',                name: 'San Francisco Zoo',              wikidata: 'Q207696',  osm_tag: { key: 'tourism', value: 'zoo' },      venue_type: 'zoo_aquarium', group: 'zoos' },
  { slug: 'oakland-zoo',           name: 'Oakland Zoo',                    wikidata: 'Q4877272', osm_tag: { key: 'tourism', value: 'zoo' },      venue_type: 'zoo_aquarium', group: 'zoos' },

  // 8.9 Cemeteries (5)
  { slug: 'forest-lawn-glendale',     name: 'Forest Lawn Memorial Park (Glendale)', wikidata: 'Q5469996', osm_tag: { key: 'landuse', value: 'cemetery' }, venue_type: 'cemetery', group: 'cemeteries' },
  { slug: 'hollywood-forever',        name: 'Hollywood Forever Cemetery',          wikidata: 'Q615998',  osm_tag: { key: 'landuse', value: 'cemetery' }, venue_type: 'cemetery', group: 'cemeteries' },
  { slug: 'westwood-village-memorial', name: 'Pierce Brothers Westwood Village Memorial Park Cemetery', wikidata: 'Q3025948', osm_tag: { key: 'landuse', value: 'cemetery' }, venue_type: 'cemetery', group: 'cemeteries' },
  { slug: 'mountain-view-oakland',    name: 'Mountain View Cemetery (Oakland)',    wikidata: 'Q3326428', osm_tag: { key: 'landuse', value: 'cemetery' }, venue_type: 'cemetery', group: 'cemeteries' },
  { slug: 'mission-dolores-cemetery', name: 'Mission Dolores Cemetery',            wikidata: 'Q6873977', osm_tag: { key: 'landuse', value: 'cemetery' }, venue_type: 'cemetery', group: 'cemeteries' },
];

// ===== Nominatim polygon fetcher =============================================
//
// Nominatim's /search?polygon_geojson=1 returns the OSM polygon for a place
// directly — much more reliable than guessing Wikidata QIDs. We rate-limit to
// 1 req/sec per Nominatim usage policy and cache per venue on disk.

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const FETCH_INTERVAL_MS = 1100;
const MAX_RETRIES = 5;
const USER_AGENT = 'XRoad-VenueSeed/0.1 (johnhollis99@gmail.com)';

interface NominatimResult {
  place_id: number;
  osm_type: string;
  osm_id: number;
  category: string;
  type: string;
  importance: number;
  name: string;
  display_name: string;
  geojson?: { type: string; coordinates: unknown };
}

let lastFetchAt = 0;
function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }
async function rateLimit() {
  const wait = lastFetchAt + FETCH_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastFetchAt = Date.now();
}

async function fetchNominatim(query: string): Promise<NominatimResult[]> {
  const url = `${NOMINATIM_ENDPOINT}?${new URLSearchParams({
    q: query,
    format: 'jsonv2',
    polygon_geojson: '1',
    countrycodes: 'us',
    limit: '5',
  })}`;

  let backoff = 2000;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await rateLimit();
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      });
    } catch (err) {
      console.warn(chalk.yellow(`  [nominatim] network error (try ${attempt + 1}): ${(err as Error).message}`));
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 32000);
      continue;
    }
    if (res.ok) return (await res.json()) as NominatimResult[];
    if (res.status === 429 || res.status === 504 || res.status === 503) {
      console.warn(chalk.yellow(`  [nominatim] HTTP ${res.status}, backing off ${backoff / 1000}s`));
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 32000);
      continue;
    }
    const body = await res.text();
    throw new Error(`Nominatim HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  throw new Error('Nominatim: max retries exceeded');
}

/** Categories Nominatim attaches to results — used to disambiguate. */
function categoryMatchesVenueType(result: NominatimResult, venueType: VenueType): boolean {
  const cat = `${result.category}:${result.type}`;
  switch (venueType) {
    case 'theme_park':        return cat === 'tourism:theme_park';
    case 'national_park':     return result.category === 'boundary' || cat === 'leisure:nature_reserve';
    case 'state_park':        return result.category === 'boundary' || result.category === 'leisure' || cat.includes('park');
    case 'campus':            return cat === 'amenity:university' || cat === 'amenity:college';
    case 'historic_district': return result.category === 'historic' || cat.includes('historic');
    case 'museum_complex':    return cat === 'tourism:museum' || cat.includes('museum');
    case 'mission':           return cat.includes('mission') || cat === 'amenity:place_of_worship' || cat === 'historic:church';
    case 'cemetery':          return cat === 'landuse:cemetery' || cat === 'amenity:grave_yard';
    case 'zoo_aquarium':      return cat === 'tourism:zoo' || cat === 'tourism:aquarium';
    default:                  return true;
  }
}

/** Convert Nominatim GeoJSON to our internal Polygon. MultiPolygons collapse
 *  to the largest sub-polygon (correct for venues with detached parking lots,
 *  satellite parcels, etc. — we want the main grounds only). */
function nominatimToPolygon(result: NominatimResult): GeoJSONPolygon | null {
  const g = result.geojson;
  if (!g) return null;

  if (g.type === 'Polygon') {
    return { type: 'Polygon', coordinates: g.coordinates as number[][][] };
  }
  if (g.type === 'MultiPolygon') {
    const polys = (g.coordinates as number[][][][]).map(rings => ({
      type: 'Polygon' as const,
      coordinates: rings,
    }));
    polys.sort((a, b) => polygonAreaM2(b) - polygonAreaM2(a));
    return polys[0] ?? null;
  }
  return null;
}

/** Multi-pass query strategy:
 *    1. "<name>, California, USA"  — most specific
 *    2. "<name>, USA"              — name only
 *    3. (only if both fail) bare name
 *  At each pass, prefer results whose Nominatim category matches venue type. */
async function lookupVenuePolygon(spec: VenueSpec): Promise<GeoJSONPolygon | null> {
  const stripped = spec.name
    .replace(/\s+(National (Historical?|Historic) Park|State Historical Monument|State Historic Park|National Park|State Park|Park)$/i, '')
    .trim();
  const queries = [
    `${spec.name}, California, USA`,
    `${spec.name}, USA`,
    spec.name,
  ];
  if (stripped !== spec.name) {
    queries.push(`${stripped}, California, USA`);
    queries.push(stripped);
  }

  for (const q of queries) {
    const results = await fetchNominatim(q);
    if (results.length === 0) continue;

    const matched = results.filter(r => r.geojson && categoryMatchesVenueType(r, spec.venue_type));
    const candidates = matched.length > 0 ? matched : results.filter(r => r.geojson);
    if (candidates.length === 0) continue;

    candidates.sort((a, b) => b.importance - a.importance);
    for (const c of candidates) {
      const poly = nominatimToPolygon(c);
      if (poly) return poly;
    }
  }
  return null;
}

// ===== Centroid ==============================================================

function centroid(poly: GeoJSONPolygon): { lat: number; lng: number } {
  const ring = poly.coordinates[0]!;
  let cx = 0, cy = 0, count = 0;
  for (const p of ring) {
    cx += p[0]!;
    cy += p[1]!;
    count++;
  }
  return { lat: cy / count, lng: cx / count };
}

// ===== venue_type → category_slug ============================================

const VENUE_CATEGORY: Record<VenueType, string> = {
  theme_park:         'local_culture',
  campus:             'architecture',
  national_park:      'nature',
  state_park:         'nature',
  historic_district:  'history',
  museum_complex:     'architecture',
  mission:            'history',
  cemetery:           'history',
  zoo_aquarium:       'local_culture',
  estate:             'history',
  shopping_district:  'local_culture',
  fairground:         'local_culture',
  religious_complex:  'history',
  industrial_complex: 'history',
};

// ===== Cache layer ===========================================================

const CACHE_DIR = path.join(__dirname, 'cache', 'venues');

interface CacheEntry {
  spec_slug: string;
  fetched_at: string;
  polygon: GeoJSONPolygon | null;
  fail_reason?: string;
}

async function loadCache(slug: string, force: boolean): Promise<CacheEntry | null> {
  if (force) return null;
  try {
    const raw = await fs.readFile(path.join(CACHE_DIR, `${slug}.json`), 'utf8');
    return JSON.parse(raw) as CacheEntry;
  } catch { return null; }
}

async function saveCache(entry: CacheEntry): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(
    path.join(CACHE_DIR, `${entry.spec_slug}.json`),
    JSON.stringify(entry, null, 2),
    'utf8',
  );
}

// ===== Main run ==============================================================

interface VenueResult {
  spec: VenueSpec;
  polygon: GeoJSONPolygon | null;
  area_m2: number | null;
  centroid: { lat: number; lng: number } | null;
  fail_reason?: string;
  fromCache: boolean;
}

async function fetchVenue(spec: VenueSpec, force: boolean): Promise<VenueResult> {
  const cached = await loadCache(spec.slug, force);
  if (cached) {
    if (!cached.polygon) {
      return {
        spec,
        polygon: null,
        area_m2: null,
        centroid: null,
        fail_reason: cached.fail_reason ?? 'cached_no_polygon',
        fromCache: true,
      };
    }
    return {
      spec,
      polygon: cached.polygon,
      area_m2: polygonAreaM2(cached.polygon),
      centroid: centroid(cached.polygon),
      fromCache: true,
    };
  }

  let poly: GeoJSONPolygon | null = null;
  try {
    poly = await lookupVenuePolygon(spec);
  } catch (err) {
    const reason = `nominatim_error:${(err as Error).message.slice(0, 80)}`;
    await saveCache({ spec_slug: spec.slug, fetched_at: new Date().toISOString(), polygon: null, fail_reason: reason });
    return { spec, polygon: null, area_m2: null, centroid: null, fail_reason: reason, fromCache: false };
  }

  if (!poly) {
    const reason = 'no_polygon_match';
    await saveCache({ spec_slug: spec.slug, fetched_at: new Date().toISOString(), polygon: null, fail_reason: reason });
    return { spec, polygon: null, area_m2: null, centroid: null, fail_reason: reason, fromCache: false };
  }

  await saveCache({ spec_slug: spec.slug, fetched_at: new Date().toISOString(), polygon: poly });
  return {
    spec,
    polygon: poly,
    area_m2: polygonAreaM2(poly),
    centroid: centroid(poly),
    fromCache: false,
  };
}

// ===== Polygon → WKT =========================================================

function polygonToWKT(poly: GeoJSONPolygon): string {
  const ring = poly.coordinates[0]!.map(p => `${p[0]} ${p[1]}`).join(', ');
  return `SRID=4326;POLYGON((${ring}))`;
}

// ===== DB upsert =============================================================

async function upsertVenue(result: VenueResult, categoryIds: Record<string, string>): Promise<{ inserted: boolean; updated: boolean; error?: string }> {
  if (!result.polygon || !result.centroid) {
    return { inserted: false, updated: false, error: 'no_polygon_skipped' };
  }
  const category_slug = VENUE_CATEGORY[result.spec.venue_type];
  const category_id = categoryIds[category_slug];
  if (!category_id) return { inserted: false, updated: false, error: `unknown_category:${category_slug}` };

  const pool = getPgPool();
  const sql = `
    INSERT INTO pois (
      name, category_id, location, tags, significance_score,
      trip_mode, source_type, source_id, source_citation,
      confidence_score, verified, description, imported_at,
      is_venue, venue_type, venue_polygon, venue_metadata
    )
    VALUES (
      $1, $2, ST_GeogFromText($3), $4, $5,
      'all', 'editorial', $6, $7,
      1.0, true, $8, NOW(),
      true, $9, ST_GeogFromText($10), $11
    )
    ON CONFLICT (source_type, source_id) WHERE merged_into IS NULL DO UPDATE SET
      name           = EXCLUDED.name,
      location       = EXCLUDED.location,
      tags           = EXCLUDED.tags,
      is_venue       = EXCLUDED.is_venue,
      venue_type     = EXCLUDED.venue_type,
      venue_polygon  = EXCLUDED.venue_polygon,
      venue_metadata = EXCLUDED.venue_metadata
    RETURNING (xmax = 0) AS is_inserted
  `;
  const point = `SRID=4326;POINT(${result.centroid.lng} ${result.centroid.lat})`;
  const tags = ['venue', result.spec.venue_type, result.spec.group];
  const description = `${result.spec.name} — venue (${result.spec.venue_type})`;
  const metadata = JSON.stringify({
    venue_slug: result.spec.slug,
    wikidata: result.spec.wikidata ?? null,
    polygon_area_m2: Math.round(result.area_m2 ?? 0),
    polygon_source: 'osm',
  });
  try {
    const res = await pool.query<{ is_inserted: boolean }>(sql, [
      result.spec.name,
      category_id,
      point,
      tags,
      40, // venue significance baseline
      `venue-${result.spec.slug}`,
      result.spec.wikidata ? `https://www.wikidata.org/wiki/${result.spec.wikidata}` : null,
      description,
      result.spec.venue_type,
      polygonToWKT(result.polygon),
      metadata,
    ]);
    const inserted = !!res.rows[0]?.is_inserted;
    return { inserted, updated: !inserted };
  } catch (err) {
    return { inserted: false, updated: false, error: (err as Error).message };
  }
}

async function logReviewQueue(spec: VenueSpec, reason: string): Promise<void> {
  const supabase = getAdminClient();
  await supabase.from('venue_classification_review').insert({
    candidate_name: spec.name,
    proposed_type: spec.venue_type,
    reason: `polygon_lookup_failed:${reason}`,
    source_hint: { wikidata: spec.wikidata, osm_tag: spec.osm_tag, slug: spec.slug },
  });
}

// ===== CLI ===================================================================

const program = new Command();
program
  .name('seed-venues')
  .option('--dry-run', 'Fetch polygons but do not write to DB', false)
  .option('--force', 'Bypass per-venue cache and re-fetch from Overpass', false)
  .option('--only <group>', 'Filter venues by group (theme_parks, missions, ...)')
  .option('--limit <n>', 'Cap number of venues processed', (v) => Number(v))
  .action(async (opts: { dryRun: boolean; force: boolean; only?: string; limit?: number }) => {
    const start = Date.now();
    let toProcess = opts.only ? VENUES.filter(v => v.group === opts.only) : VENUES;
    if (opts.limit) toProcess = toProcess.slice(0, opts.limit);

    console.log(chalk.bold(`Venue seed — ${toProcess.length} venues${opts.dryRun ? ' (DRY RUN)' : ''}`));
    if (opts.only) console.log(chalk.gray(`  filtered: only=${opts.only}`));

    const results: VenueResult[] = [];
    for (let i = 0; i < toProcess.length; i++) {
      const spec = toProcess[i]!;
      process.stdout.write(chalk.gray(`  [${i + 1}/${toProcess.length}] ${spec.name}… `));
      const r = await fetchVenue(spec, opts.force);
      results.push(r);
      if (r.polygon) {
        const km2 = ((r.area_m2 ?? 0) / 1_000_000).toFixed(3);
        console.log(chalk.green(`ok (${km2} km²)${r.fromCache ? ' [cached]' : ''}`));
      } else {
        console.log(chalk.red(`FAIL: ${r.fail_reason}`));
      }
    }

    const ok = results.filter(r => r.polygon);
    const fail = results.filter(r => !r.polygon);

    console.log('');
    console.log(chalk.bold('── Polygon fetch summary ──────────────'));
    console.log(`  total:        ${results.length}`);
    console.log(`  ${chalk.green('with polygon')}: ${ok.length}`);
    console.log(`  ${chalk.red('failed')}:       ${fail.length}`);
    console.log('');

    if (fail.length) {
      console.log(chalk.bold('── Failed venues ──────────────────────'));
      for (const f of fail) {
        console.log(chalk.red(`  • ${f.spec.name} [${f.spec.group}] — ${f.fail_reason}`));
      }
      console.log('');
    }

    // Write JSON catalog (used by classify-children --venues-from-file)
    const catalogPath = path.join(__dirname, 'cache', `venues-catalog-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    const catalogPathLatest = path.join(__dirname, 'cache', 'venues-catalog-latest.json');
    const catalog = ok.map(r => ({
      slug: r.spec.slug,
      name: r.spec.name,
      venue_type: r.spec.venue_type,
      group: r.spec.group,
      wikidata: r.spec.wikidata ?? null,
      area_m2: r.area_m2,
      centroid: r.centroid,
      polygon: r.polygon,
    }));
    await fs.writeFile(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
    await fs.writeFile(catalogPathLatest, JSON.stringify(catalog, null, 2), 'utf8');
    console.log(chalk.cyan(`  catalog: ${catalogPath}`));
    console.log(chalk.cyan(`  latest:  ${catalogPathLatest}`));

    if (opts.dryRun) {
      console.log(chalk.yellow('\nDRY RUN — no DB writes performed.'));
      console.log(`Elapsed: ${((Date.now() - start) / 1000).toFixed(1)}s`);
      return;
    }

    // Live: upsert into pois + log failures
    console.log('');
    console.log(chalk.bold('── DB upsert ──────────────────────────'));
    const categoryIds = await getCategoryIdMap();
    let inserted = 0, updated = 0, errors = 0;
    for (const r of ok) {
      const out = await upsertVenue(r, categoryIds);
      if (out.error) { errors++; console.log(chalk.red(`  ✗ ${r.spec.name}: ${out.error}`)); }
      else if (out.inserted) { inserted++; console.log(chalk.green(`  + ${r.spec.name}`)); }
      else { updated++; console.log(chalk.cyan(`  ~ ${r.spec.name}`)); }
    }
    for (const f of fail) {
      try { await logReviewQueue(f.spec, f.fail_reason ?? 'unknown'); }
      catch (err) { console.warn(chalk.yellow(`  could not log review: ${(err as Error).message}`)); }
    }

    console.log('');
    console.log(chalk.bold(`upsert: inserted=${inserted} updated=${updated} errors=${errors}`));
    console.log(chalk.bold(`review queue rows added: ${fail.length}`));
    console.log(`Elapsed: ${((Date.now() - start) / 1000).toFixed(1)}s`);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
