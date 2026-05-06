'use strict';

const { callLLM } = require('./lib/llm');

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_HISTORY     = 8;
const WORDS_PER_MIN   = 140; // comfortable narration speech rate

const DEPTH_CFG = {
  glance:     { sentences: '1-2 sentences',   seconds: [15,  30],  maxTokens: 400  },
  ride_along: { sentences: 'one paragraph',   seconds: [45,  90],  maxTokens: 600  },
  deep_dive:  { sentences: '2-3 paragraphs',  seconds: [120, 240], maxTokens: 1100 },
};

// These modes get full rolling history + callback instructions.
// family and kids get lighter injections to keep narrations self-contained.
const DEEP_HISTORY_MODES = new Set(['unfiltered', 'local']);

// ─────────────────────────────────────────────────────────────────────────────
// Composable prompt layer 1: base_prompt
// Establishes narrator voice and output contract.
// ─────────────────────────────────────────────────────────────────────────────

function base_prompt(narrator) {
  return `${narrator.system_prompt_fragment}

You are generating SPOKEN audio narration — no markdown, no asterisks, no bullet points, no section headers. Write exactly as you would speak aloud to someone in a moving car.

Tone anchors: ${narrator.tone_keywords?.join(', ') ?? 'engaging, informative'}.

Content rules: ${narrator.content_guardrails}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Composable prompt layer 2: depth_modifier
// Specifies length, pacing, and structural expectations.
// ─────────────────────────────────────────────────────────────────────────────

function depth_modifier(depth) {
  const cfg = DEPTH_CFG[depth];
  const [lo, hi] = cfg.seconds;

  const rules = {
    glance:
      `LENGTH: ${cfg.sentences} only — ${lo}-${hi} seconds of audio. ` +
      `No preamble, no "So..." or "Well..." warm-up. Open with the most interesting thing. ` +
      `Every word must earn its place.`,

    ride_along:
      `LENGTH: ${cfg.sentences} — ${lo}-${hi} seconds of audio. ` +
      `Hook the listener in the first sentence. Deliver the story. End with something that sticks — ` +
      `a surprising fact, a wry observation, or a question that lingers.`,

    deep_dive:
      `LENGTH: ${cfg.sentences} — ${lo}-${hi} seconds of audio. ` +
      `Paragraph 1: set the scene — place the listener here, make it vivid. ` +
      `Paragraph 2: go deeper — history, connections, context, the thing most people miss. ` +
      `Paragraph 3: land it — a resonant conclusion, a surprising twist, or a connection to the broader trip.`,
  };

  return rules[depth];
}

// ─────────────────────────────────────────────────────────────────────────────
// Composable prompt layer 3: context_injection
// Injects trip state and history, scaled by narrator audience_mode.
// ─────────────────────────────────────────────────────────────────────────────

function context_injection(trip_context, narration_history, narrator, corridor_mode) {
  const parts = [];
  const { audience_mode } = narrator;
  const history = narration_history ?? [];

  // Trip progress — always injected, phrased per audience
  const isStart = trip_context.stories_told === 0;
  if (audience_mode === 'kids') {
    parts.push(isStart
      ? `This is the VERY FIRST story of the ${trip_context.route_summary} adventure!`
      : `Explorer update: ${trip_context.stories_told} of ${trip_context.total_pois} discoveries made, ${trip_context.elapsed_time_minutes} minutes in!`
    );
  } else {
    parts.push(isStart
      ? `Starting the ${trip_context.route_summary} trip — this is the opening narration.`
      : `Trip: ${trip_context.route_summary}. ${trip_context.stories_told}/${trip_context.total_pois} stories told. ${trip_context.elapsed_time_minutes} min elapsed.`
    );
  }

  // History injection — scaled by audience mode
  if (history.length === 0) return parts.join('\n');

  if (audience_mode === 'kids') {
    // Just the count — no history details, keep energy simple
    parts.push(`You've already shared ${history.length} exciting ${history.length === 1 ? 'discovery' : 'discoveries'}. Keep the adventure going!`);

  } else if (audience_mode === 'family') {
    // Theme list only — educational callbacks OK, no retelling
    const seen = [...new Set(history.flatMap(h => h.key_themes))].slice(0, 10);
    parts.push(
      `Topics covered so far: ${seen.join(', ')}.\n` +
      `Educational callbacks to these themes are welcome. Do not retell a story you've already told.`
    );

  } else {
    // unfiltered + local: full history for callbacks and running gags
    const summaries = history.map(h => {
      const gags = h.jokes_or_callbacks?.length
        ? `  gags: ${h.jokes_or_callbacks.join(' / ')}`
        : '';
      return `  • ${h.poi_name} [${h.category}] — themes: ${h.key_themes.join(', ')}${gags ? '\n' + gags : ''}`;
    }).join('\n');

    parts.push(`Narration history — use for callbacks:\n${summaries}`);

    if (audience_mode === 'unfiltered') {
      // Surface repeat categories for Truck Driver running count gags
      const catCounts = history.reduce((acc, h) => {
        acc[h.category] = (acc[h.category] ?? 0) + 1;
        return acc;
      }, {});
      const repeats = Object.entries(catCounts)
        .filter(([, n]) => n > 1)
        .sort(([, a], [, b]) => b - a);

      if (repeats.length > 0) {
        const [cat, count] = repeats[0];
        parts.push(`Running count: "${cat}" has appeared ${count} times now. You've noticed — and you have opinions about it.`);
      }

      // Surface active running gags for continuation
      const activeGags = history.flatMap(h => h.jokes_or_callbacks ?? []).slice(-3);
      if (activeGags.length > 0) {
        parts.push(`Active running gags you can continue: ${activeGags.join(' | ')}`);
      }

      parts.push(
        `Fourth-wall breaks are permitted ("Look, I know I'm an AI, but..."). ` +
        `Build a running narrative arc across the trip — this isn't a series of isolated facts, it's a road trip with a personality.`
      );

    } else if (audience_mode === 'local') {
      parts.push(
        `Connect the dots between what you've seen. Locals notice patterns — ` +
        `how this stop relates to an earlier one, what the region is quietly telling you.`
      );
    }
  }

  return parts.join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Output format — appended to system prompt
// ─────────────────────────────────────────────────────────────────────────────

const OUTPUT_FORMAT = `Return ONLY a valid JSON object — no markdown fences, no explanation outside the JSON:
{
  "narration": "the spoken text here",
  "key_themes": ["2-4 short theme words from this story"],
  "jokes_or_callbacks": ["brief label for any running gag or callback introduced — empty array if none"]
}`;

// ─────────────────────────────────────────────────────────────────────────────
// System prompt assembly
// ─────────────────────────────────────────────────────────────────────────────

function buildSystemPrompt(narrator, depth) {
  return [
    base_prompt(narrator),
    depth_modifier(depth),
    OUTPUT_FORMAT,
  ].join('\n\n---\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// User prompt: POI narration
// ─────────────────────────────────────────────────────────────────────────────

function buildPOIUserPrompt(poi, trip_context, narration_history, narrator, depth) {
  const poiBlock = [
    `Location: ${poi.name}`,
    `Category: ${poi.category}`,
    poi.description ? `Background: ${poi.description}` : null,
    poi.significance_score != null ? `Significance: ${poi.significance_score}/10` : null,
  ].filter(Boolean).join('\n');

  const ctx = context_injection(trip_context, narration_history, narrator, false);

  return [
    poiBlock,
    ctx,
    `Narrate ${poi.name} now. Depth: ${depth} (${DEPTH_CFG[depth].sentences}).`,
  ].join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// User prompt: corridor filler
// ─────────────────────────────────────────────────────────────────────────────

const CORRIDOR_TONE = {
  unfiltered:
    'If this stretch is boring, say so. Roast it. Find something — anything — worth an opinion. ' +
    'Or commiserate with the listener about the miles. Make nothing feel like something.',

  local:
    'Skip the obvious. What does a local know about this stretch that the signs won\'t tell you? ' +
    'Road history, forgotten stops, what this corridor used to be, what the locals call it.',

  family:
    'Talk about the landscape, region, or road history. Make this corridor feel like it\'s worth driving through, ' +
    'not just to get somewhere.',

  kids:
    'What can you spot from the window? What wildlife might be out there? What did this land look like long ago? ' +
    'Make it a game — give them something to search for.',
};

function buildCorridorUserPrompt(trip_context, narration_history, narrator, depth) {
  const tone = CORRIDOR_TONE[narrator.audience_mode] ?? CORRIDOR_TONE.family;
  const ctx   = context_injection(trip_context, narration_history, narrator, true);

  return [
    `Between points of interest on the ${trip_context.route_summary} route, ${trip_context.elapsed_time_minutes} minutes in.`,
    ctx,
    `Generate corridor narration — landscape, road history, or regional flavor. Not POI-specific.\n${tone}`,
    `Depth: ${depth} (${DEPTH_CFG[depth].sentences}).`,
  ].join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache key — slugified from available fields (poi.id not in spec)
// ─────────────────────────────────────────────────────────────────────────────

function buildCacheKey(poi, narrator, depth, corridor_mode) {
  const poiSlug = corridor_mode
    ? 'corridor'
    : String(poi?.name ?? 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const narratorSlug = String(narrator?.slug ?? 'custom').slice(0, 20);
  return `${poiSlug}_${narratorSlug}_${depth}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a narration for a POI or corridor segment.
 *
 * @param {Object} params
 * @param {Object} params.poi               - { name, category, description, location, significance_score }
 * @param {Object} params.narrator          - { system_prompt_fragment, tone_keywords, content_guardrails, audience_mode, slug? }
 * @param {string} params.depth             - 'glance' | 'ride_along' | 'deep_dive'
 * @param {Object} params.trip_context      - { route_summary, elapsed_time_minutes, stories_told, total_pois }
 * @param {Array}  params.narration_history - last ≤8 entries: { poi_name, category, key_themes, jokes_or_callbacks, timestamp }
 * @param {boolean} params.corridor_mode    - true when filling silence between POIs
 *
 * @returns {{ text, key_themes, jokes_or_callbacks, estimated_audio_seconds, cache_key }}
 */
async function generateNarration({
  poi,
  narrator,
  depth,
  trip_context,
  narration_history = [],
  corridor_mode     = false,
}) {
  if (!DEPTH_CFG[depth]) throw new Error(`Invalid depth "${depth}"`);

  const systemPrompt = buildSystemPrompt(narrator, depth);
  const userPrompt   = corridor_mode
    ? buildCorridorUserPrompt(trip_context, narration_history, narrator, depth)
    : buildPOIUserPrompt(poi, trip_context, narration_history, narrator, depth);

  const result = await callLLM(systemPrompt, userPrompt, {
    temperature: 0.82,
    maxTokens: DEPTH_CFG[depth].maxTokens,
  });

  if (!result?.narration || typeof result.narration !== 'string') {
    throw new Error('LLM returned invalid narration structure');
  }

  const wordCount             = result.narration.trim().split(/\s+/).length;
  const estimated_audio_seconds = Math.round((wordCount / WORDS_PER_MIN) * 60);

  return {
    text:                    result.narration,
    key_themes:              Array.isArray(result.key_themes)          ? result.key_themes          : [],
    jokes_or_callbacks:      Array.isArray(result.jokes_or_callbacks)  ? result.jokes_or_callbacks  : [],
    estimated_audio_seconds,
    cache_key:               buildCacheKey(poi, narrator, depth, corridor_mode),
  };
}

/**
 * Append a narration summary to history, capping at MAX_HISTORY entries.
 *
 * @param {Array}  history  - existing narration_history array
 * @param {Object} newEntry - { poi_name, category, key_themes, jokes_or_callbacks, timestamp }
 * @returns {Array} updated history
 */
function updateNarrationHistory(history, newEntry) {
  const updated = [...history, newEntry];
  return updated.length > MAX_HISTORY
    ? updated.slice(updated.length - MAX_HISTORY)
    : updated;
}

module.exports = { generateNarration, updateNarrationHistory };
