'use strict';

/**
 * POI prompt template selector — flat audience-keyed registry.
 *
 * Phase H1.5.1 (2026-05-19) — post-collapse shape.
 *
 * The narrator-collapse decision (Phase H1.6.1 + H1.6.2) reduced the active
 * voice_configs matrix to 1 voice per audience. Narrator_slug is now fully
 * derivable from audience_mode (1:1), so the registry is keyed by
 * audience_mode alone. Each template module exports `narratorSlug` as
 * metadata for downstream consumers writing `narration_audio.narrator_slug`.
 *
 * Active voice mapping (mirrors voice_configs after the 2026-05-19 MCP collapse):
 *   family     → narrator_b (Sadachbia)
 *   kids       → narrator_a (Sulafat)
 *   local      → narrator_a (Iapetus)
 *   unfiltered → narrator_b (Schedar)
 *
 * Retired templates (deleted in H1.5.1):
 *   narrator_a_family.js, narrator_b_kids.js,
 *   narrator_b_local.js,  narrator_a_unfiltered.js
 *
 * Brief / long depths land in later phases (Phase G1 intrinsic_depth column
 * is populated; per-depth template variants are not yet broken out).
 */

const narrator_b_family_standard     = require('./narrator_b_family');
const narrator_a_kids_standard       = require('./narrator_a_kids');
const narrator_a_local_standard      = require('./narrator_a_local');
const narrator_b_unfiltered_standard = require('./narrator_b_unfiltered');

const TEMPLATES = {
  family:     { standard: narrator_b_family_standard },
  kids:       { standard: narrator_a_kids_standard },
  local:      { standard: narrator_a_local_standard },
  unfiltered: { standard: narrator_b_unfiltered_standard },
};

/**
 * Look up a POI prompt template by (audienceMode, depth).
 * Returns the template; caller can read `template.narratorSlug` for the
 * derived narrator slug if it needs to write narration_audio rows.
 *
 * Throws when (audienceMode, depth) is not registered — fail loud rather
 * than silently fall back, so a typo or stale caller surfaces immediately.
 */
function pickPoiPrompt(audienceMode, depth = 'standard') {
  const a = TEMPLATES[audienceMode];
  if (!a) {
    throw new Error(`Unknown audience_mode for POI prompts: ${audienceMode}`);
  }
  const t = a[depth];
  if (!t) {
    throw new Error(`Unknown depth for POI prompts under ${audienceMode}: ${depth}`);
  }
  return t;
}

module.exports = {
  TEMPLATES,
  pickPoiPrompt,
};
