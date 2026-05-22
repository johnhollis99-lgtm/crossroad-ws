import type { CategorySlug, TripMode } from './types.js';

export interface CategoryClassification {
  slug: CategorySlug;
  trip_mode: TripMode;
  tags: string[];
}

const OSM_RULES: Array<{
  match: (k: string, v: string) => boolean;
  slug: CategorySlug;
  trip_mode?: TripMode;
  tags?: string[];
}> = [
  { match: (k, v) => k === 'historic' && v === 'monument', slug: 'history', tags: ['monument'] },
  { match: (k, v) => k === 'historic' && v === 'memorial', slug: 'history', tags: ['memorial'] },
  { match: (k, v) => k === 'historic' && v === 'archaeological_site', slug: 'history', tags: ['archaeology'] },
  // Mining: historic mines (closed). landuse=quarry handled separately below.
  { match: (k, v) => k === 'historic' && v === 'mine', slug: 'mining', tags: ['mine', 'historic'] },
  { match: (k) => k === 'historic', slug: 'history' },

  // Volcanoes: dedicated slug — must come before the broader natural=peak rule.
  { match: (k, v) => k === 'natural' && v === 'volcano', slug: 'volcanic', trip_mode: 'hiking', tags: ['volcano'] },
  { match: (k, v) => k === 'natural' && v === 'peak', slug: 'nature', trip_mode: 'hiking', tags: ['summit'] },
  // Hot springs / geysers — geothermal features get the dedicated slug rather
  // than getting bucketed into generic 'nature'.
  { match: (k, v) => k === 'natural' && v === 'hot_spring', slug: 'hot_springs', tags: ['hot_spring'] },
  { match: (k, v) => k === 'natural' && v === 'geyser',     slug: 'hot_springs', tags: ['geyser']     },
  { match: (k, v) => k === 'natural' && v === 'waterfall', slug: 'nature', tags: ['waterfall'] },
  { match: (k, v) => k === 'waterway' && v === 'waterfall', slug: 'nature', tags: ['waterfall'] },
  { match: (k, v) => k === 'natural' && v === 'cave_entrance', slug: 'geology', tags: ['cave'] },
  { match: (k) => k === 'natural', slug: 'nature' },
  // Active quarries / open-pit mining sites
  { match: (k, v) => k === 'landuse' && v === 'quarry', slug: 'mining', tags: ['quarry'] },
  { match: (k, v) => k === 'leisure' && (v === 'park' || v === 'nature_reserve'), slug: 'nature' },
  { match: (k, v) => k === 'boundary' && v === 'national_park', slug: 'nature', tags: ['national_park'] },
  { match: (k, v) => k === 'boundary' && v === 'protected_area', slug: 'nature' },

  { match: (k, v) => k === 'building' && (v === 'church' || v === 'cathedral'), slug: 'architecture', tags: ['religious'] },
  { match: (k, v) => k === 'tourism' && v === 'viewpoint', slug: 'nature', tags: ['viewpoint'] },
  { match: (k, v) => k === 'tourism' && v === 'museum', slug: 'history', tags: ['museum'] },
  { match: (k, v) => k === 'tourism' && v === 'artwork', slug: 'art' },
  { match: (k, v) => k === 'tourism' && v === 'attraction', slug: 'hidden_gems' },

  // Bridges and dams: dedicated slugs. OSM importer's Overpass query is gated
  // by source-signal filters (wikipedia/wikidata tag) so we only get notable
  // structures here, not every overpass on the highway.
  { match: (k, v) => k === 'man_made' && v === 'bridge', slug: 'bridges', tags: ['bridge'] },
  { match: (k, v) => k === 'bridge' && v === 'yes', slug: 'bridges', tags: ['bridge'] },
  { match: (k, v) => k === 'waterway' && v === 'dam', slug: 'dams', tags: ['dam'] },
  { match: (k, v) => k === 'man_made' && v === 'dam', slug: 'dams', tags: ['dam'] },

  { match: (k, v) => k === 'amenity' && v === 'place_of_worship', slug: 'architecture', tags: ['religious'] },
  { match: (k, v) => k === 'amenity' && (v === 'restaurant' || v === 'cafe' || v === 'pub' || v === 'bar'), slug: 'food_drink' },
  { match: (k, v) => k === 'amenity' && v === 'theatre', slug: 'art' },
  { match: (k, v) => k === 'amenity' && v === 'arts_centre', slug: 'art' },

  { match: (k) => k === 'geological', slug: 'geology' },
];

export function classifyOSM(tags: Record<string, string>): CategoryClassification | null {
  for (const [k, v] of Object.entries(tags)) {
    for (const rule of OSM_RULES) {
      if (rule.match(k, v)) {
        return {
          slug: rule.slug,
          trip_mode: rule.trip_mode ?? 'all',
          tags: rule.tags ?? [],
        };
      }
    }
  }
  return null;
}

const WIKIDATA_INSTANCE_MAP: Record<string, CategorySlug> = {
  Q839954: 'history',
  Q33506: 'history',
  Q4989906: 'history',
  Q570116: 'nature',
  Q46831: 'nature',
  Q8502: 'nature',
  Q34038: 'nature',
  Q35509: 'geology',
  Q24398318: 'architecture',
  Q16970: 'architecture',
  Q207694: 'art',
  Q207320: 'food_drink',
};

export function classifyWikidataInstance(qids: string[]): CategorySlug | null {
  for (const q of qids) {
    const slug = WIKIDATA_INSTANCE_MAP[q];
    if (slug) return slug;
  }
  return null;
}
