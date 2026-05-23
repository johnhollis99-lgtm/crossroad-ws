'use strict';

/**
 * Region prompt template selector — narrator-keyed registry.
 *
 * Migration Batch 2 (Track C, 2026-05-22): replaces the audience-keyed
 * registry (4 audiences × 2 narrators = 8 templates) shipped pre-Batch-2.
 * Mirrors the Batch-1 POI narrator-keyed pattern; audience-mode
 * addressability is collapsed at the runtime by voice_configs.voice_slot
 * per Batch-1 Migration 2.
 *
 * Active narrator catalog (mirrors narrators table after Batch-1 Migration 1):
 *   narrator_a  Window Seat — reverent / contemplative (no prosody block)
 *   narrator_b  Shotgun     — conversational + Tier-2 SSML prosody
 *
 * Returns the full Anthropic Messages array directly — no
 * `template.systemPrompt` + `template.buildUserPrompt(region)` indirection.
 * Callers split the first message (role:'system') into the API's
 * `system` field and pass the remainder as `messages`.
 *
 * Retired audience-keyed templates (deleted in this batch):
 *   narrator_a_family.js, narrator_a_kids.js, narrator_a_unfiltered.js,
 *   narrator_a_local.js, narrator_b_family.js, narrator_b_kids.js,
 *   narrator_b_unfiltered.js, narrator_b_local.js
 */

const { buildNarratorARegionPrompt } = require('./narrator_a');
const { buildNarratorBRegionPrompt } = require('./narrator_b');

function pickRegionPrompt(narratorSlug, region, depth, sources) {
  if (narratorSlug === 'narrator_a') {
    return buildNarratorARegionPrompt(region, depth, sources);
  }
  if (narratorSlug === 'narrator_b') {
    return buildNarratorBRegionPrompt(region, depth, sources);
  }
  throw new Error(`Unknown narrator_slug: ${narratorSlug}`);
}

module.exports = { pickRegionPrompt };
