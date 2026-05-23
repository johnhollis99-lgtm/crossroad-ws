'use strict';

/**
 * POI prompt template selector — narrator-keyed registry.
 *
 * Migration Batch 1 (2026-05-22): replaces the audience-keyed registry
 * shipped in Phase H1.5.1 (2026-05-19). Audience-mode is no longer the
 * dispatch axis — see addendum §5.7 + Migrations 1-2 in this batch.
 *
 * Active narrator catalog (mirrors narrators table after Migration 1):
 *   narrator_a  Window Seat — reverent / contemplative
 *   narrator_b  Shotgun     — conversational / easygoing
 *
 * Voice assignment lives in voice_configs (narrator_slug, voice_slot)
 * per Migration 2; the runtime picks slot 1 or 2 per request and the
 * prompt template is selected by narrator_slug alone.
 *
 * Retired audience-keyed templates (deleted in this batch):
 *   narrator_a_kids.js, narrator_a_local.js,
 *   narrator_b_family.js, narrator_b_unfiltered.js
 *
 * Returns the full messages array directly — no `template.systemPrompt`
 * + `template.buildUserPrompt(poi)` indirection like the prior registry.
 * Callers pass the whole array to the Anthropic Messages API, splitting
 * the first message (role:'system') into the API's `system` field.
 */

const { buildNarratorAPrompt } = require('./narrator_a');
const { buildNarratorBPrompt } = require('./narrator_b');

function pickPoiPrompt(narratorSlug, depth, poi, sources) {
  if (narratorSlug === 'narrator_a') {
    return buildNarratorAPrompt(poi, depth, sources);
  }
  if (narratorSlug === 'narrator_b') {
    return buildNarratorBPrompt(poi, depth, sources);
  }
  throw new Error(`Unknown narrator_slug: ${narratorSlug}`);
}

module.exports = { pickPoiPrompt };
