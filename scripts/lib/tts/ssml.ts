/**
 * SSML post-processor for narration output.
 *
 * Per docs/decisions/2026-05-15-narrator-b-prosody.md (Tier 2 enlarged):
 * the LLM emits prose plus two marker tokens; this module converts the
 * marker form to Google Cloud TTS SSML. The LLM never emits raw XML —
 * markers only — which sidesteps the entire malformed-XML risk class.
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
const PUA_RANGE = /[-]/g;

function escapeXml(body: string): string {
  return body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Convert marker-syntax narration text to a Google Cloud TTS SSML
 * <speak> document. Pure function.
 */
export function ssmlize(text: string): string {
  let body = escapeXml(text);
  const slots: string[] = [];
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

  // Pass 2: reserve cardinal-number slots. Same PUA-protection rationale.
  body = body.replace(NUMBER_PATTERN, (n) => reserve(`<say-as interpret-as="cardinal">${n}</say-as>`));

  // Pass 3: restore all placeholders to their reserved SSML.
  body = body.replace(PUA_RANGE, (ch) => slots[ch.charCodeAt(0) - PUA_BASE] ?? ch);

  return `<speak>${body}</speak>`;
}

/**
 * Plain-text fallback: strip markers, SSML tags, and unwrap any escaped
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
    .replace(PUA_RANGE, ''); // safety: drop any unrestored placeholders
}

/**
 * Tally markers/tags in input (raw LLM output or post-processed SSML) for
 * the levers-diff that goes back to the curator.
 */
export interface SsmlMarkerStats {
  pause500: number;
  pause250: number;
  pauseOther: number; // {{PAUSE_NNN}} where NNN is neither 500 nor 250
  ssmlBreaks: number; // <break/> in the post-processed SSML
  ssmlSayAs: number;  // <say-as ...> in the post-processed SSML
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
