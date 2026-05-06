export type SourceType =
  | 'osm'
  | 'wikidata'
  | 'nrhp'
  | 'state_landmark'
  | 'gnis'
  | 'narrative_extracted'
  | 'editorial'
  | 'user_contributed';

export type TripMode = 'driving' | 'hiking' | 'city' | 'all';

export type CategorySlug =
  | 'history'
  | 'nature'
  | 'architecture'
  | 'food_drink'
  | 'local_culture'
  | 'hidden_gems'
  | 'art'
  | 'geology';

export interface BoundingBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

export interface NormalizedPOI {
  name: string;
  category_slug: CategorySlug;
  lat: number;
  lng: number;
  tags: string[];
  significance_score: number;
  trip_mode: TripMode;
  source_type: SourceType;
  source_id: string;
  source_citation: string | null;
  confidence_score: number;
  verified: boolean;
  description?: string | null;
}

export interface ImportOptions {
  bbox?: BoundingBox;
  county?: string;
  state?: string;
  limit?: number;
  dryRun: boolean;
  force: boolean;
  cacheDir: string;
}

export interface ImportResult {
  source: SourceType;
  fetched: number;
  normalized: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  durationMs: number;
}

export function emptyResult(source: SourceType): ImportResult {
  return {
    source,
    fetched: 0,
    normalized: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    durationMs: 0,
  };
}
