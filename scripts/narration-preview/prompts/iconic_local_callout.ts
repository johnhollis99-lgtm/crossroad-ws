/**
 * Tier 2 — iconic_local_callout brief preview prompt.
 *
 * Used by scripts/narration-preview/preview.ts for Tier 2 iconic_local
 * callouts where the POI's structured fields (name + signature_hook +
 * iconic_local_reasons) are rendered as a brief 70-80-word paragraph
 * (~30 seconds spoken at 150 wpm). Closes the "Tier 2 has data, no
 * narration code" gap — the 9-row Tier 2 food/drink seed (commit
 * 804b6d2) populated signature_hook + iconic_local_reasons on every
 * row but no template existed to render them.
 *
 * Preview-side fork only. Production-side promotion to
 * server/prompts/pois/ is deferred to a future commit after preview
 * calibration. When that production-side template lands, this file
 * becomes the upstream to manually mirror (same posture as
 * tier1-soul-full.ts's relationship to narrator_b_family.js).
 *
 * Differs from tier1-soul-full.ts (the only sibling under prompts/) in
 * three load-bearing ways:
 *   1. Inputs are STRUCTURED FIELDS (name + signature_hook + reasons)
 *      rather than a curator-authored prose source.
 *   2. Output is ~70-80 words / ~30 seconds (vs ~500-550 / ~3.5-4 min).
 *   3. No PROSODY DISCIPLINE pause markers, no delimiter-marked output
 *      protocol — single short paragraph, raw text.
 *
 * Last sync with production: N/A (production-side does not yet exist).
 */

export const ICONIC_LOCAL_CALLOUT_SYSTEM_PROMPT = `You are a warm, ground-level voice narrating a brief callout for a beloved local institution. The listener is driving past or near this spot right now. You have roughly thirty seconds to make them want to know it exists.

Write a single paragraph of 70 to 80 words. No more, no less.

Structure:
1. Open with a specific anchor — a year, a quirk, a fact. Never "Welcome to" or "This is."
2. Land the why-it-matters in the middle — what makes this place itself, not interchangeable with any other.
3. Close with a small sensory or flavor detail. Something a person could imagine on their tongue, in their ear, or under their hand.

Voice:
- Conversational. Contractions are fine.
- Active verbs. Drop passive constructions.
- One adjective is plenty. Stacked adjectives flatten the prose.
- No superlatives unless the data earns them.
- No tourist-brochure language. No "must-visit," no "iconic" said out loud — show it instead.

You will receive three fields:
- name: the place's name
- signature_hook: a one-sentence essence
- iconic_local_reasons: an array of reasons the place qualifies as iconic-local

Use the signature_hook as your conceptual core. Pull at most one or two threads from iconic_local_reasons to add texture. Don't try to fit everything. The brief lives or dies on its tightness.

Output the paragraph and nothing else. No preamble, no markdown, no title.`;

export const ICONIC_LOCAL_CALLOUT_VOICE_MAPPING = {
  audience_mode: 'family',
  narrator_slug: 'narrator_b',
} as const;

export function buildIconicLocalCalloutUserPrompt(opts: {
  name: string;
  signature_hook: string;
  iconic_local_reasons: string[];
}): string {
  const lines: string[] = [`name: ${opts.name}`];
  lines.push(`signature_hook: ${opts.signature_hook}`);
  lines.push(`iconic_local_reasons: ${opts.iconic_local_reasons.join(', ')}`);
  return lines.join('\n');
}
