/**
 * RoadStory — lib/supabase.ts
 * Supabase client + typed POI query helpers
 */

import { createClient } from '@supabase/supabase-js';

// ── Env-driven config — fail-loud if missing ────────────────────────────
const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL in environment. Check .env.');
}
if (!SUPABASE_ANON_KEY) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_ANON_KEY in environment. Check .env.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Types ───────────────────────────────────────────────────────────────
export interface POICategory {
  id: string;
  slug: string;
  display_name: string;
  sort_order: number;
}

export interface POI {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  tags: string[];
  dist_from_route_m?: number;
  distance_m?: number;
  /** Narration cache: "{mode}-{depth}-{voice_id}" → audio_url. Populated by server after generation. */
  narration_cache?: Record<string, string>;
  source_type?: string;
}

export interface RoutePolylinePoint {
  latitude: number;
  longitude: number;
}

// ── Query: top-level driving categories from poi_categories ─────────────
export async function getCategories(): Promise<POICategory[]> {
  const { data, error } = await supabase
    .from('poi_categories')
    .select('id, slug, display_name, sort_order')
    .is('parent_id', null)
    .eq('relevant_driving', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[Supabase] getCategories error:', error);
    return [];
  }
  return (data ?? []) as POICategory[];
}

// ── Count: POIs within corridor — uses POST (no head:true) to avoid HTTP/2 URL-length limits
export async function countPOIsAlongRoute(
  polylinePoints: RoutePolylinePoint[],
  corridorMi: number = 15,
  mode?: string,
  categories?: string[] | null
): Promise<number | null> {
  if (polylinePoints.length < 2) return null;

  // Downsample to ≤150 points to keep the WKT payload small while preserving shape
  const pts = downsamplePolyline(polylinePoints, 150);

  const wkt = `SRID=4326;LINESTRING(${
    pts.map(p => `${p.longitude} ${p.latitude}`).join(',')
  })`;

  // count:'exact' without head:true → PostgREST sends a POST with body, avoiding GET URL limits
  const { count, error } = await supabase.rpc('get_corridor_pois', {
    route_geom: wkt,
    corridor_width_miles: corridorMi,
    category_filter: categories?.length ? categories : null,
    mode_filter: mode ?? null,
  }, { count: 'exact' }).limit(0);

  if (error) {
    console.error('[Supabase] countPOIsAlongRoute error:', error);
    return null;
  }
  return count;
}

// Reduces a polyline to at most maxPoints using uniform stride sampling
function downsamplePolyline<T>(points: T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return points;
  const stride = (points.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => points[Math.round(i * stride)]);
}

// ── Query: POIs along a confirmed route corridor ─────────────────────────
// Called once after user taps "Confirm & Drive" / "Confirm & Hike"
export async function getPOIsAlongRoute(
  polylinePoints: RoutePolylinePoint[],
  corridorMi: number,
  categories: string[] | null = null,
  mode?: string
): Promise<POI[]> {
  if (polylinePoints.length < 2) return [];

  // Match countPOIsAlongRoute's downsampling. A Google-decoded long-haul
  // polyline (e.g. LA→Cambria) is 1000–2000 points; sending the full WKT
  // makes ST_DWithin/ST_LineLocatePoint slow enough to time out
  // server-side. 150 points preserves shape and matches the count call's
  // shape so badge counts and rendered markers stay consistent.
  const pts = downsamplePolyline(polylinePoints, 150);

  const wkt = `SRID=4326;LINESTRING(${
    pts.map(p => `${p.longitude} ${p.latitude}`).join(',')
  })`;

  const { data, error } = await supabase.rpc('get_corridor_pois', {
    route_geom: wkt,
    corridor_width_miles: corridorMi,
    category_filter: categories,
    mode_filter: mode ?? null,
  });

  if (error) {
    console.error('[Supabase] get_corridor_pois error:', error);
    return [];
  }

  return (data ?? []) as POI[];
}

// ── Query: POIs near current GPS location (live driving trigger) ─────────
// Called every ~30s or on significant GPS movement
export async function getNearbyPOIs(
  lat: number,
  lng: number,
  radiusM: number = 800,
  categories: string[] | null = null,
  mode?: string
): Promise<POI[]> {
  const { data, error } = await supabase.rpc('get_nearby_pois', {
    user_lat: lat,
    user_lng: lng,
    radius_m: radiusM,
    categories,
    mode_filter: mode ?? null,
  });

  if (error) {
    console.error('[Supabase] get_nearby_pois error:', error);
    return [];
  }

  return (data ?? []) as POI[];
}

// ── Save a completed route + filter snapshot ─────────────────────────────
export async function saveRoute(route: {
  destination: string;
  originLat?: number;
  originLng?: number;
  destLat?: number;
  destLng?: number;
  distanceMi?: number;
  durationMin?: number;
  filterSnapshot: object;
}) {
  const { error } = await supabase.from('routes').insert({
    destination: route.destination,
    origin_lat: route.originLat,
    origin_lng: route.originLng,
    dest_lat: route.destLat,
    dest_lng: route.destLng,
    distance_mi: route.distanceMi,
    duration_min: route.durationMin,
    filter_snapshot: route.filterSnapshot,
  });

  if (error) console.error('[Supabase] saveRoute error:', error);
}

// ── Narrator record returned by get_available_narrators RPC ─────────────
export interface NarratorRecord {
  id: string;
  slug: string | null;
  name: string;
  subtitle: string;
  description: string;
  audience_mode: string | null;
  content_rating: string;
  content_guardrails: string | null;
  tone_keywords: string[];
  voice_id: string | null;
  voice_descriptor: string | null;
  intro_line: string | null;
  system_prompt_fragment: string | null;
  avatar_color_bg: string | null;
  avatar_color_text: string | null;
  avatar_initials: string;
  is_preset: boolean;
  source: 'preset' | 'custom';
}

// ── Fetch all narrators available to a user (presets + their customs) ────
export async function getAvailableNarrators(userId?: string): Promise<NarratorRecord[]> {
  const { data, error } = await supabase.rpc('get_available_narrators', {
    p_user_id: userId ?? null,
  });
  if (error) {
    console.error('[Supabase] getAvailableNarrators error:', error);
    return [];
  }
  return (data as NarratorRecord[]) ?? [];
}

// ── Save a trip session with narrator + filter configuration ─────────────
export async function saveTrip(params: {
  routeName?: string;
  origin?: string;
  destination?: string;
  distanceMi?: number;
  durationMin?: number;
  narratorId?: string;
  userNarratorId?: string;
  narratorName?: string;
  depth: string;
  categoryFilter: string[];
  poiDistanceM: number;
  status?: string;
  startedAt?: string;
}): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('trips')
    .insert({
      user_id:          null, // replace with auth uid when auth is added
      route_name:       params.routeName,
      origin:           params.origin,
      destination:      params.destination,
      distance_mi:      params.distanceMi,
      duration_min:     params.durationMin,
      narrator_id:      params.narratorId ?? null,
      user_narrator_id: params.userNarratorId ?? null,
      narrator_name:    params.narratorName,
      depth:            params.depth,
      category_filter:  params.categoryFilter,
      poi_distance_m:   params.poiDistanceM,
      status:           params.status ?? 'pending',
      started_at:       params.startedAt ?? null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Supabase] saveTrip error:', error);
    throw new Error(error.message ?? 'Failed to save trip');
  }
  return data as { id: string };
}

// ── Contribution system — types ──────────────────────────────────────────────

export type ContributionType =
  | 'poi_verification'
  | 'poi_correction'
  | 'poi_addition'
  | 'narration_rating'
  | 'photo_upload'
  | 'trail_addition';

export type RewardType =
  | 'free_month'
  | 'discount_month'
  | 'premium_narrator_unlock'
  | 'early_access';

export interface ContributionResult {
  contribution_id: string;
  points_earned:   number;
  points_pending:  number;
  total_points:    number;
  new_badges:      string[];
  points_possible: number;
  remaining_today: number;
}

export interface ContributionStats {
  total_points:   number;
  current_badge:  string | null;
  next_badge:     string | null;
  next_badge_at:  number | null;
  points_to_next: number;
  progress_pct:   number;
  counts_by_type: Partial<Record<ContributionType, number>>;
  earned_badges:  string[];
}

export interface RewardResult {
  reward_id:         string;
  reward_type:       RewardType;
  points_spent:      number;
  remaining_balance: number;
  expires_at:        string | null;
}

const SERVER = (process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://localhost:3001');

// ── submitContribution ────────────────────────────────────────────────────────
// Sends to the server endpoint so anti-spam middleware runs first.
export async function submitContribution(params: {
  userId:           string;
  type:             ContributionType;
  poiId?:           string;
  details?:         Record<string, unknown>;
}): Promise<ContributionResult | null> {
  try {
    const res = await fetch(`${SERVER}/api/contributions/submit`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id:           params.userId,
        contribution_type: params.type,
        poi_id:            params.poiId ?? null,
        details:           params.details ?? {},
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error('[Supabase] submitContribution error:', res.status, body);
      return null;
    }
    return (await res.json()) as ContributionResult;
  } catch (err) {
    console.error('[Supabase] submitContribution fetch error:', err);
    return null;
  }
}

// ── getUserContributionStats ──────────────────────────────────────────────────
export async function getUserContributionStats(
  userId: string
): Promise<ContributionStats | null> {
  try {
    const res = await fetch(`${SERVER}/api/contributions/stats/${userId}`);
    if (!res.ok) return null;
    return (await res.json()) as ContributionStats;
  } catch (err) {
    console.error('[Supabase] getUserContributionStats error:', err);
    return null;
  }
}

// ── redeemReward ─────────────────────────────────────────────────────────────
export async function redeemReward(params: {
  userId:     string;
  rewardType: RewardType;
}): Promise<RewardResult | null> {
  try {
    const res = await fetch(`${SERVER}/api/contributions/redeem`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: params.userId, reward_type: params.rewardType }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error('[Supabase] redeemReward error:', res.status, body);
      return null;
    }
    return (await res.json()) as RewardResult;
  } catch (err) {
    console.error('[Supabase] redeemReward fetch error:', err);
    return null;
  }
}

// ── getTripContributions ──────────────────────────────────────────────────────
// For the Trip Summary screen: fetch contributions made during a specific trip.
// Contributions record trip_id in their details jsonb field.
export async function getTripContributions(
  userId: string,
  tripId: string
): Promise<{ type: ContributionType; points: number; status: string }[]> {
  const { data, error } = await supabase
    .from('user_contributions')
    .select('contribution_type, points_earned, status')
    .eq('user_id', userId)
    .filter('details->>trip_id', 'eq', tripId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[Supabase] getTripContributions error:', error);
    return [];
  }
  return (data ?? []).map(r => ({
    type:   r.contribution_type as ContributionType,
    points: r.points_earned,
    status: r.status,
  }));
}

// ── Recent locations (origin / destination search history) ──────────────

export interface RecentLocation {
  id: string;
  place_id: string | null;
  display_name: string;
  lat: number;
  lng: number;
  type: 'origin' | 'destination';
  last_used_at: string;
}

const LS_KEYS: Record<'origin' | 'destination', string> = {
  origin:      'rs_recent_origins',
  destination: 'rs_recent_destinations',
};
const isWeb = typeof localStorage !== 'undefined';

export async function getRecentLocations(
  type: 'origin' | 'destination',
  limit = 5,
): Promise<RecentLocation[]> {
  if (isWeb) {
    try {
      const raw = localStorage.getItem(LS_KEYS[type]);
      const items: RecentLocation[] = raw ? JSON.parse(raw) : [];
      return items.slice(0, limit);
    } catch {
      return [];
    }
  }

  const { data, error } = await supabase
    .from('user_recent_locations')
    .select('id, place_id, display_name, lat, lng, type, last_used_at')
    .eq('type', type)
    .is('user_id', null)
    .order('last_used_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as RecentLocation[];
}

export async function saveRecentLocation(params: {
  placeId?: string;
  displayName: string;
  lat: number;
  lng: number;
  type: 'origin' | 'destination';
}): Promise<void> {
  if (isWeb) {
    try {
      const key = LS_KEYS[params.type];
      const raw = localStorage.getItem(key);
      let items: RecentLocation[] = raw ? JSON.parse(raw) : [];
      // Remove existing entry with same place_id or same display_name
      items = items.filter(i =>
        !(params.placeId && i.place_id === params.placeId) &&
        i.display_name !== params.displayName
      );
      items.unshift({
        id:           `local_${Date.now()}`,
        place_id:     params.placeId ?? null,
        display_name: params.displayName,
        lat:          params.lat,
        lng:          params.lng,
        type:         params.type,
        last_used_at: new Date().toISOString(),
      });
      localStorage.setItem(key, JSON.stringify(items.slice(0, 8)));
    } catch {}
    return;
  }

  // Native: Supabase
  if (params.placeId) {
    const { data } = await supabase
      .from('user_recent_locations')
      .select('id')
      .eq('place_id', params.placeId)
      .eq('type', params.type)
      .is('user_id', null)
      .maybeSingle();

    if (data?.id) {
      await supabase
        .from('user_recent_locations')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', data.id);
      return;
    }
  }

  await supabase.from('user_recent_locations').insert({
    user_id:      null,
    place_id:     params.placeId ?? null,
    display_name: params.displayName,
    lat:          params.lat,
    lng:          params.lng,
    type:         params.type,
    last_used_at: new Date().toISOString(),
  });
}

// ── Load recent routes ───────────────────────────────────────────────────
export async function getRecentRoutes(limit = 5) {
  const { data, error } = await supabase
    .from('routes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Supabase] getRecentRoutes error:', error);
    return [];
  }

  return data ?? [];
}

// ── Narration audio cache ────────────────────────────────────────────────────

// Returns the cached audio URL, or null if no valid cache exists.
// Pass userId for user-narrator slugs; omit for preset narrators.
export async function getCachedNarration(
  poiId:        string,
  narratorSlug: string,
  depth:        'glance' | 'ride_along' | 'deep_dive',
  userId?:      string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_cached_narration', {
    p_poi_id:        poiId,
    p_narrator_slug: narratorSlug,
    p_depth:         depth,
    p_user_id:       userId ?? null,
  });

  if (error) {
    console.error('[Supabase] getCachedNarration error:', error);
    return null;
  }
  return (data as string | null) ?? null;
}

// Stores a generated audio URL in the cache. Typically called from the server
// after narration generation; exposed here for completeness.
export async function cacheNarration(params: {
  poiId:        string;
  narratorSlug: string;
  depth:        'glance' | 'ride_along' | 'deep_dive';
  audioUrl:     string;
  userId?:      string;
}): Promise<string | null> {
  const { data, error } = await supabase.rpc('cache_narration', {
    p_poi_id:        params.poiId,
    p_narrator_slug: params.narratorSlug,
    p_depth:         params.depth,
    p_audio_url:     params.audioUrl,
    p_user_id:       params.userId ?? null,
  });

  if (error) {
    console.error('[Supabase] cacheNarration error:', error);
    return null;
  }
  return data as string | null; // returns the narration_audio row id
}