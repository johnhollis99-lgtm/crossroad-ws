/**
 * Route badge and tag assignment — pure functions, no React dependency.
 */

export type Badge = 'Fastest' | 'Shortest' | 'Scenic';

export interface RouteTag {
  label: string;
  type: 'pro' | 'con' | 'neutral';
}

export interface BadgeRoute {
  index: number;
  distanceMi: number;
  durationMin: number;
  poiCount: number | null;
  summary?: string;
}

const NEAR_IDENTICAL_PCTS = 0.05;
const HW_PATTERN = /\b(I-\d+|US-\d+|Interstate|Highway|Hwy|Freeway|Expressway|Turnpike)\b/i;

export function computeBadges(routes: BadgeRoute[]): Partial<Record<number, Badge>> {
  if (routes.length === 0) return {};

  const durations  = routes.map(r => r.durationMin);
  const distances  = routes.map(r => r.distanceMi);
  const minDur     = Math.min(...durations);
  const maxDur     = Math.max(...durations);
  const minDist    = Math.min(...distances);
  const maxDist    = Math.max(...distances);

  const durSpread  = minDur  > 0 ? (maxDur  - minDur)  / minDur  : 0;
  const distSpread = minDist > 0 ? (maxDist - minDist) / minDist : 0;

  if (routes.length > 1 && durSpread <= NEAR_IDENTICAL_PCTS && distSpread <= NEAR_IDENTICAL_PCTS) return {};

  const fastest  = routes.reduce((a, b) => a.durationMin <= b.durationMin ? a : b);
  const shortest = routes.reduce((a, b) => a.distanceMi  <= b.distanceMi  ? a : b);

  const result: Partial<Record<number, Badge>> = {};
  routes.forEach(r => {
    if (r.index === fastest.index) {
      result[r.index] = 'Fastest';
    } else if (r.index === shortest.index) {
      result[r.index] = 'Shortest';
    } else if (r.poiCount !== null && fastest.poiCount !== null && r.poiCount > fastest.poiCount) {
      result[r.index] = 'Scenic';
    }
  });
  return result;
}

/**
 * Returns comparative pro/con/neutral tags for a route relative to the full set.
 * Only meaningful when there are 2+ routes.
 */
export function computeRouteTags(route: BadgeRoute, allRoutes: BadgeRoute[]): RouteTag[] {
  if (allRoutes.length <= 1) return [];

  const tags: RouteTag[] = [];

  const fastest  = allRoutes.reduce((a, b) => a.durationMin <= b.durationMin ? a : b);
  const shortest = allRoutes.reduce((a, b) => a.distanceMi  <= b.distanceMi  ? a : b);

  // ── Time ──────────────────────────────────────────────────────────────────
  if (route.index === fastest.index) {
    const savedMin = Math.round(Math.max(...allRoutes.map(r => r.durationMin)) - route.durationMin);
    if (savedMin >= 2) tags.push({ label: `Saves ${savedMin} min`, type: 'pro' });
  } else {
    const extraMin = Math.round(route.durationMin - fastest.durationMin);
    if (extraMin >= 2) tags.push({ label: `+${extraMin} min`, type: 'con' });
  }

  // ── Distance ──────────────────────────────────────────────────────────────
  if (route.index === shortest.index) {
    const savedMi = +(Math.max(...allRoutes.map(r => r.distanceMi)) - route.distanceMi).toFixed(1);
    if (savedMi >= 1) tags.push({ label: `Saves ${savedMi} mi`, type: 'pro' });
  } else {
    const extraMi = +(route.distanceMi - shortest.distanceMi).toFixed(1);
    if (extraMi >= 1) tags.push({ label: `+${extraMi} mi`, type: 'neutral' });
  }

  // ── Stories ───────────────────────────────────────────────────────────────
  const loaded = allRoutes.filter(r => r.poiCount !== null);
  if (loaded.length === allRoutes.length && route.poiCount !== null) {
    const counts  = loaded.map(r => r.poiCount as number);
    const maxPOI  = Math.max(...counts);
    const minPOI  = Math.min(...counts);
    if (maxPOI > minPOI) {
      if (route.poiCount === maxPOI) tags.push({ label: 'Most stories', type: 'pro' });
      else if (route.poiCount === minPOI) tags.push({ label: 'Fewer stories', type: 'con' });
    }
  }

  // ── Road type ─────────────────────────────────────────────────────────────
  const avgMph   = route.durationMin > 0 ? (route.distanceMi / route.durationMin) * 60 : 0;
  const isHighway = HW_PATTERN.test(route.summary ?? '') || avgMph >= 45;
  tags.push(isHighway
    ? { label: 'Highway',    type: 'neutral' }
    : { label: 'Back roads', type: 'pro' }
  );

  return tags;
}
