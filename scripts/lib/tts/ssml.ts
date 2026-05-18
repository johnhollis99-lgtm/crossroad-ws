/**
 * SSML post-processor for narration output.
 *
 * Per docs/decisions/2026-05-15-narrator-b-prosody.md (Tier 2 enlarged):
 * the LLM emits prose plus two marker tokens; this module converts the
 * marker form to Google Cloud TTS SSML. The LLM never emits raw XML --
 * markers only -- which sidesteps the entire malformed-XML risk class.
 *
 * Markers (LLM emits these inline):
 *   {{PAUSE_500}}  ->  <break time="500ms"/>
 *   {{PAUSE_250}}  ->  <break time="250ms"/>
 *   (other {{PAUSE_NNN}} accepted -- NNN is any integer ms)
 *
 * Auto-wrapped (no LLM marker required):
 *   Any digit sequence  ->  <say-as interpret-as="cardinal">N</say-as>
 *   Pattern: \d+(?:,\d{3})*(?:\.\d+)?  -- handles "14,495", "100", "0.5"
 *
 * Skip rules (Number Format Disambiguation -- decision doc §Number Format):
 *   - Digits immediately preceded by a highway-prefix word (Highway, Hwy,
 *     Interstate, Route, Rte, I-, US-, CA-, SR-, State Route) stay
 *     unwrapped so Google's road-number heuristic reads them naturally.
 *     The LLM is told to spell highway numbers phonetically; this is the
 *     downstream safety net for slips.
 *   - Bare 4-digit calendar years 1500-2199 stay unwrapped (when NOT
 *     followed by a measurement unit) so Google's native year-reading
 *     heuristic kicks in. Year-by-year span covers California history
 *     from Cabrillo (1542) onward. "1849 miles" wraps (distance);
 *     "1849 Gold Rush" skips (date).
 *
 * Skip events are returned in the result so the caller can log them to
 * llm_calls for LLM-adherence auditing (how often the LLM emits digits
 * despite phonetic-spelling instructions).
 *
 * XML escaping: every &, <, >, ", ' in the narration body is escaped
 * before tag insertion so the LLM cannot accidentally inject SSML.
 *
 * The transform uses Unicode Private Use Area characters (U+E000+) as
 * placeholders during the multi-pass replacement so that digits inside
 * inserted tag attributes (e.g., the "500" in time="500ms") are never
 * re-wrapped by the cardinal-number pass.
 */

const PAUSE_PATTERN = /\{\{PAUSE_(\d+)\}\}/g;
const NUMBER_PATTERN = /\d+(?:,\d{3})*(?:\.\d+)?/g;
const PUA_BASE = 0xE000;
const PUA_MAX_OFFSET = 0xF8FF - PUA_BASE;
// Built via RegExp constructor so the source file doesn't need to contain
// literal U+E000/U+F8FF characters (which prior tooling stripped silently,
// reducing the regex to /[-]/g — a bug that nullified placeholder
// restoration in pass 3). The constructor form is byte-stable.
const PUA_RANGE = new RegExp('[\\uE000-\\uF8FF]', 'g');

// Highway-context skip: digits immediately preceded (within 0-3 chars of
// whitespace/hyphen) by a highway-prefix word stay unwrapped.
const HIGHWAY_CONTEXT = /\b(?:Highway|Hwy|Interstate|Route|Rte|I-|US-|CA-|SR-|State Route)\s*-?\s*$/i;

// Calendar-year skip: bare 4-digit years 1500-2199 stay unwrapped when
// not followed by a measurement unit. Range covers California history
// from Cabrillo (1542) onward.
const YEAR_VALUE = /^(?:1[5-9]\d{2}|20\d{2}|21\d{2})$/;
const YEAR_UNIT_SUFFIX = /^\s*(?:feet|ft\b|miles?|mi\b|years?|year-old|million|billion|thousand|hundred|sq\s*mi|square|meters?\b|kilometers?|km\b|people|residents|inhabitants|°)/i;

function escapeXml(body: string): string {
  return body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface SkipReport {
  type: 'highway' | 'year';
  value: string;
  context: string; // up to 30 chars of preceding text (post-escape)
}

export interface SsmlResult {
  ssml: string;
  skips: SkipReport[];
}

/**
 * Convert marker-syntax narration text to a Google Cloud TTS SSML
 * <speak> document plus the list of cardinal-wrap skips applied. Pure
 * function (skips are returned, not logged here).
 */
export function ssmlize(text: string): SsmlResult {
  let body = escapeXml(text);
  const slots: string[] = [];
  const skips: SkipReport[] = [];
  const reserve = (ssml: string): string => {
    const idx = slots.length;
    if (idx >= PUA_MAX_OFFSET) {
      throw new Error(`ssmlize: placeholder overflow (>${PUA_MAX_OFFSET} insertions)`);
    }
    slots.push(ssml);
    return String.fromCharCode(PUA_BASE + idx);
  };

  // Pass 1: reserve pause-marker slots. PUA-protected so the cardinal pass
  // cannot see the digits in time="500ms".
  body = body.replace(PAUSE_PATTERN, (_, ms) => reserve(`<break time="${ms}ms"/>`));

  // Pass 2: cardinal-wrap with skip rules. Callback receives (match, offset, full).
  body = body.replace(NUMBER_PATTERN, (match, ...rest) => {
    // String.replace callback args after the match: [...captureGroups, offset, fullString]
    // NUMBER_PATTERN has no capture groups, so: [offset, fullString]
    const offset = rest[rest.length - 2] as number;
    const full = rest[rest.length - 1] as string;

    // Highway-context skip
    const precedingChars = full.slice(Math.max(0, offset - 30), offset);
    if (HIGHWAY_CONTEXT.test(precedingChars)) {
      skips.push({ type: 'highway', value: match, context: precedingChars.slice(-30) });
      return match;
    }

    // Calendar-year skip (when not followed by a measurement unit)
    if (YEAR_VALUE.test(match)) {
      const trailing = full.slice(offset + match.length, offset + match.length + 20);
      if (!YEAR_UNIT_SUFFIX.test(trailing)) {
        skips.push({ type: 'year', value: match, context: precedingChars.slice(-30) });
        return match;
      }
    }

    // Sanitize cardinal content to digits-only. Google's TTS silently
    // drops the wrapped content when commas appear inside
    // <say-as interpret-as="cardinal">N</say-as> — confirmed empirically
    // 2026-05-18 via scripts/diag-ssml-comma-cardinal.ts (comma-wrapped
    // "6,380" produced 5336 bytes vs bare "6380" at 11227 bytes; "100,000"
    // 6247 vs "100000" 9875). The prose body keeps human-readable commas
    // for the LLM-output narration_text; only the tag's content is stripped.
    // Non-digit chars stripped include commas, decimal points, hyphens —
    // see decision doc §Cardinal-content sanitization for decimal-handling
    // notes if narrations gain decimal measurements.
    const digitsOnly = match.replace(/[^0-9]/g, '');
    return reserve(`<say-as interpret-as="cardinal">${digitsOnly}</say-as>`);
  });

  // Pass 3: restore all placeholders to their reserved SSML.
  body = body.replace(PUA_RANGE, (ch) => slots[ch.charCodeAt(0) - PUA_BASE] ?? ch);

  return { ssml: `<speak>${body}</speak>`, skips };
}

/**
 * Plain-text fallback: strip markers, SSML tags, and unwrap escaped
 * entities so the result reads naturally if used as input.text retry.
 * Called when Google rejects the SSML <speak> doc.
 */
export function stripMarkersAndTags(text: string): string {
  return text
    .replace(PAUSE_PATTERN, '')
    .replace(/<\/?speak\b[^>]*>/g, '')
    .replace(/<break\b[^>]*\/?>/g, '')
    .replace(/<say-as\b[^>]*>([\s\S]*?)<\/say-as>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(PUA_RANGE, '');
}

/**
 * Tally markers/tags in input (raw LLM output and post-processed SSML)
 * for the levers-diff that goes back to the curator.
 */
export interface SsmlMarkerStats {
  pause500: number;
  pause250: number;
  pauseOther: number;
  ssmlBreaks: number;
  ssmlSayAs: number;
}

export function tallyMarkers(rawLlmOutput: string, ssmlOutput: string): SsmlMarkerStats {
  let pause500 = 0;
  let pause250 = 0;
  let pauseOther = 0;
  for (const m of rawLlmOutput.matchAll(PAUSE_PATTERN)) {
    const ms = Number(m[1]);
    if (ms === 500) pause500++;
    else if (ms === 250) pause250++;
    else pauseOther++;
  }
  const ssmlBreaks = (ssmlOutput.match(/<break\b/g) ?? []).length;
  const ssmlSayAs = (ssmlOutput.match(/<say-as\b/g) ?? []).length;
  return { pause500, pause250, pauseOther, ssmlBreaks, ssmlSayAs };
}
