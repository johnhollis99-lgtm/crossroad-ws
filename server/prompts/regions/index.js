'use strict';

/**
 * Region prompt template selector.
 *
 * Given (narratorSlug, audienceMode), returns the matching template's
 * { systemPrompt, buildUserPrompt } pair. All 8 templates per addendum
 * §3 + §5 (2 narrators × 4 audiences). Consumed by
 * scripts/precache-region-narrations.ts and the eventual region
 * narration runtime route.
 */

const a_family     = require('./narrator_a_family');
const a_kids       = require('./narrator_a_kids');
const a_unfiltered = require('./narrator_a_unfiltered');
const a_local      = require('./narrator_a_local');
const b_family     = require('./narrator_b_family');
const b_kids       = require('./narrator_b_kids');
const b_unfiltered = require('./narrator_b_unfiltered');
const b_local      = require('./narrator_b_local');

const TEMPLATES = {
  narrator_a: {
    family:     a_family,
    kids:       a_kids,
    unfiltered: a_unfiltered,
    local:      a_local,
  },
  narrator_b: {
    family:     b_family,
    kids:       b_kids,
    unfiltered: b_unfiltered,
    local:      b_local,
  },
};

function pickRegionPrompt(narratorSlug, audienceMode) {
  const n = TEMPLATES[narratorSlug];
  if (!n) throw new Error(`Unknown narrator_slug: ${narratorSlug}`);
  const t = n[audienceMode];
  if (!t) throw new Error(`Unknown audience_mode for ${narratorSlug}: ${audienceMode}`);
  return t;
}

module.exports = {
  TEMPLATES,
  pickRegionPrompt,
};
