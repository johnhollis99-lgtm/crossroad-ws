/**
 * Shared Anthropic Messages API helper + seed-text prompt for E1b/c/d.
 *
 * Why this exists separately from sources/usgs-provinces.ts:
 *   The E1a (USGS Geomorphic Provinces) importer was first written with
 *   a second-person system prompt ("you cross into…"). Subsequent review
 *   determined seed text should be factual third-person reference prose;
 *   narration templates apply voice/tone downstream. Per user direction,
 *   E1a rows in the live DB stay as-is (second-person); the new prompt
 *   applies going forward. usgs-provinces.ts therefore keeps its inline
 *   second-person prompt and inline callHaiku; this module is the
 *   forward-looking helper for E1b (EPA ecoregions), E1c (Native Land —
 *   if Haiku is desired there), and E1d (named valleys, if Haiku is
 *   wired for descriptions).
 *
 * The retry / cost-calc / API mechanics in this module duplicate
 * usgs-provinces.ts's callHaiku. Acceptable mild duplication for clean
 * semantic separation between "legacy E1a prompt" and "current prompt".
 * Future refactor can consolidate once E1a description-regeneration is
 * explicitly approved.
 */
import chalk from 'chalk';

import { getPgPool } from './supabase.js';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const HAIKU_MAX_TOKENS = 700;

// Haiku 4.5 pricing per Anthropic's public schedule:
//   input  : $1.00 / 1M tokens
//   output : $5.00 / 1M tokens
const HAIKU_INPUT_USD_PER_TOKEN  = 1.00 / 1_000_000;
const HAIKU_OUTPUT_USD_PER_TOKEN = 5.00 / 1_000_000;

const HAIKU_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000];
const HAIKU_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504, 529]);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface HaikuResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/**
 * Low-level Anthropic Messages call with retry. The caller supplies both
 * the system prompt and the user prompt — this helper makes no assumption
 * about content shape.
 */
export async function callHaiku(systemPrompt: string, userPrompt: string, label = ''): Promise<HaikuResponse> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in environment');

  type AnthropicResponse = {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= HAIKU_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: HAIKU_MODEL,
          max_tokens: HAIKU_MAX_TOKENS,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        const err = new Error(`Haiku API ${res.status}: ${errText.slice(0, 200)}`);
        if (HAIKU_RETRYABLE_STATUSES.has(res.status) && attempt < HAIKU_RETRY_DELAYS_MS.length) {
          lastErr = err;
          const wait = HAIKU_RETRY_DELAYS_MS[attempt]!;
          console.log(chalk.yellow(`    ${label || 'haiku'}: ${err.message} — retrying in ${wait}ms (attempt ${attempt + 2})`));
          await sleep(wait);
          continue;
        }
        throw err;
      }

      const json = (await res.json()) as AnthropicResponse;
      const text = (json.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('')
        .trim();
      const inputTokens = json.usage?.input_tokens ?? 0;
      const outputTokens = json.usage?.output_tokens ?? 0;
      const costUsd =
        inputTokens * HAIKU_INPUT_USD_PER_TOKEN +
        outputTokens * HAIKU_OUTPUT_USD_PER_TOKEN;
      if (!text) throw new Error('Haiku returned empty text');
      return { text, inputTokens, outputTokens, costUsd };
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      if (attempt < HAIKU_RETRY_DELAYS_MS.length && !e.message.startsWith('Haiku API')) {
        lastErr = e;
        const wait = HAIKU_RETRY_DELAYS_MS[attempt]!;
        console.log(chalk.yellow(`    ${label || 'haiku'}: ${e.message} — retrying in ${wait}ms (attempt ${attempt + 2})`));
        await sleep(wait);
        continue;
      }
      throw e;
    }
  }
  throw lastErr ?? new Error('Haiku call failed after retries');
}

export async function logLlmCall(
  inputChars: number,
  resp: HaikuResponse,
): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `INSERT INTO public.llm_calls
       (call_type, provider, model_or_voice, input_chars, input_tokens, output_tokens, cost_usd, related_id)
     VALUES ('claude', 'anthropic', $1, $2, $3, $4, $5, NULL)`,
    [HAIKU_MODEL, inputChars, resp.inputTokens, resp.outputTokens, resp.costUsd],
  );
}

// ---------------------------------------------------------------------
// Region seed-text prompt (third-person, factual reference)
// ---------------------------------------------------------------------

/**
 * System prompt for region seed text.
 *
 * Seed text is the description column on `regions`. It feeds downstream
 * narration templates (Phase H), which apply voice/tone/pacing per
 * audience mode + narrator. The seed itself must therefore be VOICE-
 * NEUTRAL: factual, third-person, present-tense, no addressee, no
 * narrator personality. Think encyclopedia summary, not tour guide.
 */
export const SEED_TEXT_SYSTEM_PROMPT =
  'You are drafting factual reference text about a geographic region for ' +
  'a database. This text will be used later as input to narration ' +
  'generation; do NOT write the narration itself. Write a single ' +
  'paragraph of 200–400 words in third-person, present-tense, ' +
  'declarative prose. No second-person addressee ("you", "your") — the ' +
  'text must read as a neutral reference, not a guided tour. No narrator ' +
  'personality. No tourist-brochure language. Focus on physical character ' +
  '(geology, geomorphology, ecology, climate, vegetation, hydrology) and ' +
  'notable geographic context (named features, boundaries with adjacent ' +
  'regions). Avoid bullet lists, headings, meta-commentary, and ' +
  'narrative scene-setting ("imagine driving…"). Output only the ' +
  'paragraph itself.';

/**
 * Build the user-prompt for region seed text. Caller supplies the region
 * name and any source context (e.g. EPA fact-sheet excerpt, OSM tag dump).
 */
export function buildSeedTextUserPrompt(regionName: string, sourceContext: string): string {
  return (
    `Region name: ${regionName}\n\n` +
    `Source context:\n${sourceContext}\n\n` +
    'Draft the reference paragraph now.'
  );
}

/**
 * One-shot wrapper: generate seed text for a region and log the LLM call.
 */
export async function draftRegionSeedText(
  regionName: string,
  sourceContext: string,
): Promise<HaikuResponse> {
  const userPrompt = buildSeedTextUserPrompt(regionName, sourceContext);
  const resp = await callHaiku(SEED_TEXT_SYSTEM_PROMPT, userPrompt, regionName);
  await logLlmCall(sourceContext.length, resp);
  return resp;
}
