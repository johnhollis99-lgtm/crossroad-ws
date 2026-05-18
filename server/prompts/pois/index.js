'use strict';

/**
 * POI prompt template selector (parallel to server/prompts/regions/index.js).
 *
 * v1: narrator_b × Family / standard depth only, per
 * docs/decisions/2026-05-15-top-tier-poi-first-run.md.
 * Brief / long depths and other (narrator, audience) pairs land in
 * later phases.
 */

const narrator_b_family_standard = require('./narrator_b_family');

const TEMPLATES = {
  narrator_b: {
    family: {
      standard: narrator_b_family_standard,
    },
  },
};

/**
 * Look up a POI prompt template by (narratorSlug, audienceMode, depth).
 * Throws if the (slug, mode, depth) triple is not registered.
 */
function pickPoiPrompt(narratorSlug, audienceMode, depth = 'standard') {
  const n = TEMPLATES[narratorSlug];
  if (!n) throw new Error(`Unknown narrator_slug for POI prompts: ${narratorSlug}`);
  const m = n[audienceMode];
  if (!m) throw new Error(`Unknown audience_mode for POI prompts under ${narratorSlug}: ${audienceMode}`);
  const t = m[depth];
  if (!t) throw new Error(`Unknown depth for POI prompts under ${narratorSlug}/${audienceMode}: ${depth}`);
  return t;
}

module.exports = {
  TEMPLATES,
  pickPoiPrompt,
};
