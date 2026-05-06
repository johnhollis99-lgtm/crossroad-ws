export interface SignificanceSignals {
  isOnNationalRegister?: boolean;
  isStateLandmark?: boolean;
  hasWikipediaArticle?: boolean;
  wikipediaPageviews30d?: number;
  hasWikidataEntry?: boolean;
  wikidataSitelinkCount?: number;
  isProtectedArea?: boolean;
  isUnesco?: boolean;
  yearEstablished?: number;
  visitorsPerYear?: number;
  sourceCount?: number;
}

const W = {
  nationalRegister: 0.20,
  stateLandmark: 0.10,
  unesco: 0.25,
  wikipedia: 0.10,
  wikipediaPageviews: 0.10,
  wikidataSitelinks: 0.10,
  protectedArea: 0.05,
  age: 0.05,
  visitors: 0.10,
  sourceCount: 0.10,
} as const;

function logScale(x: number, k: number): number {
  if (x <= 0) return 0;
  return Math.min(1, Math.log10(1 + x) / k);
}

export function computeSignificance(s: SignificanceSignals): number {
  let score = 0;

  if (s.isOnNationalRegister) score += W.nationalRegister;
  if (s.isStateLandmark) score += W.stateLandmark;
  if (s.isUnesco) score += W.unesco;
  if (s.hasWikipediaArticle) score += W.wikipedia;
  if (s.isProtectedArea) score += W.protectedArea;

  if (s.wikipediaPageviews30d != null) {
    score += W.wikipediaPageviews * logScale(s.wikipediaPageviews30d, 5);
  }
  if (s.wikidataSitelinkCount != null) {
    score += W.wikidataSitelinks * logScale(s.wikidataSitelinkCount, 2);
  }
  if (s.visitorsPerYear != null) {
    score += W.visitors * logScale(s.visitorsPerYear, 6);
  }
  if (s.sourceCount != null && s.sourceCount > 1) {
    score += W.sourceCount * Math.min(1, (s.sourceCount - 1) / 3);
  }
  if (s.yearEstablished != null) {
    const ageYears = new Date().getFullYear() - s.yearEstablished;
    if (ageYears > 0) score += W.age * Math.min(1, ageYears / 200);
  }

  return Math.max(0, Math.min(1, score));
}

export function defaultConfidence(sourceType: string, sourceCount = 1): number {
  const base: Record<string, number> = {
    editorial: 1.0,
    nrhp: 0.95,
    state_landmark: 0.9,
    wikidata: 0.85,
    osm: 0.75,
    gnis: 0.7,
    narrative_extracted: 0.6,
    user_contributed: 0.5,
  };
  const b = base[sourceType] ?? 0.6;
  const bonus = sourceCount > 1 ? Math.min(0.1, (sourceCount - 1) * 0.05) : 0;
  return Math.min(1, b + bonus);
}
