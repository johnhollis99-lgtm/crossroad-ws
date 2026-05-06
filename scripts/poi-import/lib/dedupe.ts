const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'at', 'in', 'on',
  'park', 'site', 'historic', 'monument', 'memorial', 'national',
  'state', 'old', 'new',
]);

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(name: string, dropStopwords = true): string[] {
  const tokens = normalizeName(name).split(' ').filter(Boolean);
  return dropStopwords ? tokens.filter((t) => !STOPWORDS.has(t)) : tokens;
}

export function tokenSetRatio(a: string, b: string): number {
  const sa = new Set(tokenize(a));
  const sb = new Set(tokenize(b));
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let intersect = 0;
  for (const t of sa) if (sb.has(t)) intersect++;
  const union = sa.size + sb.size - intersect;
  return intersect / union;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] ?? 0) + 1,
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length] ?? 0;
}

export function levenshteinRatio(a: string, b: string): number {
  const an = normalizeName(a);
  const bn = normalizeName(b);
  const max = Math.max(an.length, bn.length);
  if (max === 0) return 1;
  return 1 - levenshtein(an, bn) / max;
}

export interface SimilarityScore {
  tokenSet: number;
  levenshtein: number;
  combined: number;
}

export function nameSimilarity(a: string, b: string): SimilarityScore {
  const tokenSet = tokenSetRatio(a, b);
  const lev = levenshteinRatio(a, b);
  return { tokenSet, levenshtein: lev, combined: 0.6 * tokenSet + 0.4 * lev };
}

export function haversineMeters(
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface DupeMatch {
  id: string;
  source_type: string;
  source_id: string;
  similarity: SimilarityScore;
  distanceMeters: number;
}

export interface DupeCheckOpts {
  maxDistanceMeters?: number;
  minSimilarity?: number;
}

export function isLikelyDuplicate(
  candidate: { name: string; lat: number; lng: number },
  existing: { name: string; lat: number; lng: number },
  opts: DupeCheckOpts = {},
): { duplicate: boolean; similarity: SimilarityScore; distanceMeters: number } {
  const maxDist = opts.maxDistanceMeters ?? 200;
  const minSim = opts.minSimilarity ?? 0.78;
  const distanceMeters = haversineMeters(candidate.lat, candidate.lng, existing.lat, existing.lng);
  const similarity = nameSimilarity(candidate.name, existing.name);
  const duplicate = distanceMeters <= maxDist && similarity.combined >= minSim;
  return { duplicate, similarity, distanceMeters };
}
