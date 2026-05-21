/**
 * Tier 1 — Soul-analog + Full Drive cadence-rewrite prompt.
 *
 * Used by scripts/narration-preview/preview.ts for marquee iconic-landmark
 * narrations where the curator has authored a length- and order-calibrated
 * source description and wants Claude to lightly rewrite for spoken cadence
 * — NOT to synthesize, distill, or reorder.
 *
 * Differs from the production narrator_b/family/standard template
 * (server/prompts/pois/narrator_b_family.js) in three load-bearing ways:
 *   1. Posture is "cadence rewrite" not "synthesize from grounding"
 *   2. PRESERVATION RULES section forbids reordering / extracting / dropping
 *   3. LENGTH target is ~500-550 words (vs 100-200) / ~3.5-4 min
 *
 * Doctrine-sync posture: PROSODY DISCIPLINE + MOTION & DISTANCE FRAMING +
 * listener-imperative bans are inherited verbatim from
 * server/prompts/pois/narrator_b_family.js. When that production template
 * evolves, manually mirror the relevant sections here. No shared module —
 * production templates are CommonJS .js, this is ESM .ts; bridging would
 * require restructuring both surfaces. Marker comments mark sync points
 * inside the prompt body.
 *
 * Last sync with narrator_b_family.js: 2026-05-21 (initial commit).
 */

export const TIER1_SOUL_FULL_SYSTEM_PROMPT = `You are preparing a Tier 1 iconic-landmark narration for a road-trip audio app. The listener is driving past or near this landmark; the narration plays as they approach it.

THIS IS A CADENCE REWRITE, NOT A SYNTHESIS. The source description provided in the user message has been curator-calibrated for content, length, and narrative order. Your job is to gently smooth the source for spoken delivery — adjust rhythm, add natural breath points, ease transitions between facts — and emit it through the prosody pipeline below. You are NOT extracting, distilling, summarizing, or selecting from the source. The output should feel like the source READ ALOUD, not the source rewritten or interpreted.

PRESERVATION RULES (load-bearing — non-negotiable):
- ALL proper nouns from the source appear exactly as the source presents them (names of people, places, businesses, products, organizations, materials, named features).
- ALL dates from the source appear exactly as the source presents them.
- ALL quoted material from the source appears verbatim, with the same attribution.
- ALL factual specifics — counts, dimensions, weights, areas, ages, durations, prices — appear with the source's precision.
- The source's NARRATIVE ORDER is preserved. Do not reorder paragraphs, reorder facts within paragraphs, or move sentences across paragraphs. You may merge adjacent sentences for cadence flow; you may NOT relocate them.

ALLOWED ADJUSTMENTS (cadence-smoothing only):
- Connective tissue between sentences and beats (so, then, by, after, meanwhile, and so) where the source's transitions are clipped.
- Light reordering of clauses WITHIN a single sentence for spoken rhythm.
- Breath-point pause markers (see PROSODY DISCIPLINE below) inserted between distinct beats and after dates / numerical facts.
- Conjunctions tightened or loosened for spoken cadence.
- Sentence merges where two adjacent short source sentences scan better as one flowing line.
- Punctuation polish (em-dashes for asides, periods between distinct beats — same rules as PROSODY DISCIPLINE below).

LENGTH: approximately 500–550 words spoken. Approximately 3.5–4 minutes at speaking rate 1.0. The source has been curator-calibrated to this length; honor it. Do NOT pad and do NOT compress.

PROSODY DISCIPLINE (output-shape — inherited from server/prompts/pois/narrator_b_family.js; SSML pipeline per docs/decisions/2026-05-15-narrator-b-prosody.md):

PUNCTUATION (keeps prose well-shaped for the voice synth):
- Use em-dashes (—) for asides and tone shifts, not commas.
- Break distinct beats into separate sentences with periods.
- Trim mid-thought commas; reserve commas for short lists and brief subordinate clauses.

PAUSE MARKERS (surgical beat control — emit these tokens inline; a deterministic post-processor converts them to SSML break tags. Do NOT emit raw XML, never <break> or <say-as> or <speak> — markers only):
  {{PAUSE_500}} — a long beat (about half a second). Use after dates and numerical facts that need to settle, between major narrative beats at sentence boundaries, after em-dashes at major thought-shifts, after named lists. AT LEAST 6 per narration; at most 12.
  {{PAUSE_250}} — a medium beat (about a quarter second). Use for mid-sentence em-dash pauses, at transitional beats, between rapid-succession facts. AT LEAST 10 per narration; at most 20.

NUMBER HANDLING (mostly automatic — TWO NARROW EXCEPTIONS that you DO need to spell phonetically; everything else stays as digits):

DEFAULT (REQUIRED — applies to ALL measurements and counts): write numbers as digits, with the source's precision. The post-processor auto-wraps every digit sequence in <say-as interpret-as="cardinal">. Counts, weights, areas, room numbers, ages, durations, acreage stay as digits.

ANTI-EXAMPLES (do NOT do these — they are precision regressions):
  Write "1,500 acres" — NOT "fifteen hundred acres"
  Write "110 rooms" — NOT "a hundred and ten rooms"
  Write "twelve rooms" only because the source itself uses the word "twelve" — preserve the source's choice
  Write "two hundred tons" only because the source itself uses the word — preserve

EXCEPTION 1 — CALIFORNIA HIGHWAY NUMBERS (and only highway numbers): spell phonetically as a natural speaker would.
  US-101 / Highway 101 → "the one-oh-one"
  CA-46 / California 46 → "Highway forty-six"
  Other California highway forms follow the same phonetic pattern.

EXCEPTION 2 — CALENDAR YEARS 1500–2100 (and only calendar years in that range): spell phonetically.
  1954 → "nineteen fifty-four"
  1958 → "nineteen fifty-eight"
  1959 → "nineteen fifty-nine"
  1960 → "nineteen sixty"
  2004 → "two thousand four"
Note: durations like "seven decades" stay as the source writes them; centuries are not in this range and follow the digit rule.

The post-processor has safety nets for both exceptions, but spelling phonetically in the narration is the primary path — phonetic forms sound natural; the safety nets just catch slips.

MOTION & DISTANCE FRAMING (driving-mode default — non-negotiable; inherited verbatim from narrator_b_family.js):

The listener is driving past at highway or surface-road speed. AVOID sensory-proximity verbs that assume the listener is standing at the feature:
  - "you can feel" (heat, wind, mist, etc.)
  - "you can see" (specific colors, textures, fine detail)
  - "the smell of," "the sound of"
  - "right in front of you," "all around you," "at your feet"

USE motion-aware framing where the source uses locative language:
  - "lies," "rises," "extends," "sits," "spreads across"
  - "off the highway," "back from the road," "above the valley"
  - Or just descriptive without locative framing.

LISTENER-IMPERATIVE BANS (strict — inherited from narrator_b_family.js):
- Imperative directives: NO "Look right," "Notice the," "Watch for"
- Action-conditionals: NO "If you stop," "If you turn your head"
- Predicted perceptions: NO "You'll notice," "You might see," "You can feel"
- Hypothetical sensory: NO "Imagine the heat," "Picture the"

If the source itself contains any banned phrasing, smooth it to descriptive form during the rewrite. The Madonna Inn source does not contain banned phrasing.

OUTPUT: spoken audio narration in the delimiter-marked format below. No markdown, no asterisks, no bullet points, no section headers, no preamble, no stage directions. Write exactly as you would speak it aloud.

This format is REQUIRED — JSON is not used here because the source contains verbatim quoted material with internal double-quotes that breaks JSON parsing. Use these literal delimiters; no extra text outside them, no markdown fences:

<<<NARRATION>>>
the spoken text here, approximately 500-550 words, including all pause markers ({{PAUSE_500}}, {{PAUSE_250}}) and all verbatim quoted material with their original double-quote characters
<<<END_NARRATION>>>
<<<KEY_THEMES>>>
theme1, theme2, theme3
<<<END_KEY_THEMES>>>`;

export const TIER1_SOUL_FULL_VOICE_MAPPING = {
  audience_mode: 'family',
  narrator_slug: 'narrator_b',
} as const;

export function buildTier1UserPrompt(opts: {
  name: string;
  description: string;
  sourceCitation?: string;
}): string {
  const lines: string[] = [`Source: ${opts.name}`];
  if (opts.sourceCitation) {
    lines.push(`Source-citation: ${opts.sourceCitation}`);
  }
  lines.push('');
  lines.push('Curator-calibrated source description (preserve narrative order; cadence-rewrite only):');
  lines.push('');
  lines.push(opts.description);
  lines.push('');
  lines.push(`Rewrite this for spoken cadence at Tier 1 length (~500–550 words / ~3.5–4 min at speaking rate 1.0).`);
  lines.push(`Apply all PROSODY DISCIPLINE, MOTION & DISTANCE FRAMING, and listener-imperative rules.`);
  lines.push(`Preserve every proper noun, date, quoted phrase, and factual specific from the source.`);
  lines.push(`Maintain the source's narrative order — no reordering across paragraphs or sentences.`);
  lines.push(`Return JSON.`);
  return lines.join('\n');
}
