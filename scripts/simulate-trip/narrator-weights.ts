/**
 * Per-narrator category weight profiles per addendum §5.3.
 *
 * The addendum names eight category buckets; this module maps them to
 * the actual `poi_categories.slug` values in the DB so the lookahead
 * worker can apply `narrator_weight[category_slug]` directly.
 *
 * Unmapped slugs default to 1.0 (no weight effect — equivalent to "the
 * category is neither preferred nor de-preferred by this narrator").
 *
 * v1 surface uses narrator_b only; narrator_a profile is included so
 * the audience-expansion arc can re-rank against it without code change.
 */

export interface NarratorWeights {
  [slug: string]: number;
}

/**
 * narrator_b — conversational / casual / friend-in-cab.
 * Per addendum §5.3 column "Narrator B (conversational)".
 */
export const NARRATOR_B_WEIGHTS: NarratorWeights = {
  // Geology / geography
  geology: 1.0,
  // Natural features (also "geography" semantically)
  nature: 1.2,
  // Anthropology / indigenous
  native_history: 1.2,
  // History (NRHP/CHL)
  history: 1.3,
  // Architecture
  architecture: 1.0,
  // Roadside / Americana — narrator_b's strong-suit per the spec
  hidden_gems: 1.6,
  // Local lore / quirks
  local_culture: 1.5,
  // Engineering / infrastructure
  bridges: 1.3,
  dams: 1.3,
  // Art — falls under "local lore" semantically (the local museum scene)
  art: 1.5,
  // Recreation — no clear addendum bucket; neutral default
  recreation: 1.0,
  // Food/drink — Roadside/Americana
  food_drink: 1.6,
};

/**
 * narrator_a — reverent / contemplative.
 * Per addendum §5.3 column "Narrator A (reverent)".
 */
export const NARRATOR_A_WEIGHTS: NarratorWeights = {
  geology: 1.4,
  nature: 1.3,
  native_history: 1.4,
  history: 1.2,
  architecture: 1.2,
  hidden_gems: 0.7,
  local_culture: 0.8,
  bridges: 0.9,
  dams: 0.9,
  art: 0.8,
  recreation: 1.0,
  food_drink: 0.7,
};

export function getNarratorWeights(slug: string): NarratorWeights {
  if (slug === 'narrator_a') return NARRATOR_A_WEIGHTS;
  if (slug === 'narrator_b') return NARRATOR_B_WEIGHTS;
  throw new Error(`unknown narrator_slug: ${slug}`);
}

export function weightFor(weights: NarratorWeights, categorySlug: string): number {
  return weights[categorySlug] ?? 1.0;
}
