const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { callLLM }  = require('../lib/llm');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_MODES   = new Set(['random', 'custom']);
const VALID_DEPTHS  = new Set(['glance', 'ride_along', 'deep_dive']);
const VALID_RATINGS = new Set(['everyone', 'rated_r']);

const MAX_DAILY = 5;

const EXISTING_NARRATORS = [
  'The Professor', 'The Truck Driver', 'The Junior Ranger', 'The Local',
];

const DEPTH_DESCRIPTIONS = {
  glance:      'Brief, punchy — 1-2 sentences. Listener is driving fast and wants quick snapshots.',
  ride_along:  'Moderate detail — 3-4 sentences. Conversational, like a knowledgeable passenger.',
  deep_dive:   'Full stories — 4-6 sentences. Explore context, history, and connections.',
};

// ── POST /api/narrators/generate ─────────────────────────────────────────────
router.post('/generate', async (req, res) => {
  // ── 1. Input validation ───────────────────────────────────────────────────
  const { mode, user_id, depth, categories, content_rating, vibe_words } = req.body ?? {};

  const errors = [];
  if (!VALID_MODES.has(mode))           errors.push('mode must be "random" or "custom"');
  if (!user_id || !UUID_RE.test(user_id)) errors.push('user_id must be a valid UUID');
  if (!VALID_DEPTHS.has(depth))          errors.push('depth must be glance, ride_along, or deep_dive');
  if (!VALID_RATINGS.has(content_rating)) errors.push('content_rating must be "everyone" or "rated_r"');
  if (!Array.isArray(categories) || categories.length === 0)
    errors.push('categories must be a non-empty array');
  if (mode === 'custom' && (!Array.isArray(vibe_words) || vibe_words.length === 0))
    errors.push('vibe_words is required for custom mode');

  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  // Sanitize string arrays — strip anything that isn't a short alphanumeric word
  const safeCategories = categories
    .filter(c => typeof c === 'string')
    .map(c => c.replace(/[^\w\s-]/g, '').trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 20);

  const safeVibes = (mode === 'custom' ? vibe_words ?? [] : [])
    .filter(v => typeof v === 'string')
    .map(v => v.replace(/[^\w\s-]/g, '').trim().slice(0, 30))
    .filter(Boolean)
    .slice(0, 10);

  // ── 2. Rate limit: max MAX_DAILY generations per user per UTC day ─────────
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { count, error: countErr } = await supabase
    .from('user_narrators')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user_id)
    .gte('created_at', startOfDay.toISOString());

  if (countErr) {
    console.error('rate-limit query failed:', countErr);
    return res.status(500).json({ error: 'Could not verify rate limit' });
  }

  if (count >= MAX_DAILY) {
    return res.status(429).json({
      error:      'Daily generation limit reached',
      detail:     `Max ${MAX_DAILY} narrators per day. Resets at UTC midnight.`,
      remaining_today: 0,
    });
  }

  // ── 3. Build LLM prompt ───────────────────────────────────────────────────
  const ratingRule = content_rating === 'rated_r'
    ? 'Content rating is 18+. Humor may be sharp and irreverent, strong language is allowed. Never cruel, no slurs, no punching down, no shock value.'
    : 'Content rating is Everyone. Universally appropriate — no profanity, violence, or adult themes.';

  const vibeSection = mode === 'custom' && safeVibes.length
    ? `The user wants a narrator that feels: ${safeVibes.join(', ')}. Shape the personality around these vibes.`
    : 'Fully randomize the personality — make it unexpected and memorable.';

  const systemPrompt = `You are a creative director inventing narrator characters for RoadStory, a GPS-triggered audio storytelling app for road trips.

Generate ONE unique narrator persona that is clearly distinct from these existing characters: ${EXISTING_NARRATORS.join(', ')}.

Return ONLY a valid JSON object — no markdown fences, no explanation — with exactly these fields:
{
  "name": "The [Archetype]",
  "subtitle": "2 to 4 words",
  "description": "One sentence, strictly max 60 characters — count them",
  "tone_keywords": ["word1", "word2", "word3", "word4"],
  "system_prompt_fragment": "2-3 sentences: voice, personality quirks, storytelling style. Written to be injected into an LLM system prompt.",
  "intro_line": "1-2 sentences in first person, how this narrator greets the listener at the start of a trip.",
  "content_guardrails": "Rules defining appropriate content for this narrator — injected into LLM prompts.",
  "avatar_initials": "XX"
}

Hard rules:
- name must start with "The" and be an archetype label — never a human first name.
- subtitle is 2–4 words, no more.
- description: one sentence, absolute maximum of 60 characters. Count carefully.
- avatar_initials: first letter of each word in the name, max 2 characters (e.g. "The Historian" → "TH").
- ${ratingRule}`;

  const userPrompt = `Generate a narrator for a road trip with these preferences:

Storytelling depth: ${depth} — ${DEPTH_DESCRIPTIONS[depth]}
Interest categories: ${safeCategories.join(', ')}
Content rating: ${content_rating}

${vibeSection}

The narrator's storytelling should naturally lean toward ${safeCategories.join(', ')}. Give them a distinctive point of view — not just a description of a type.`;

  // ── 4. Call LLM ──────────────────────────────────────────────────────────
  let generated;
  try {
    generated = await callLLM(systemPrompt, userPrompt, { temperature: 0.9, maxTokens: 700 });
  } catch (err) {
    console.error('LLM error:', err.message);
    return res.status(502).json({ error: 'Narrator generation failed', detail: 'LLM call error' });
  }

  // ── 5. Validate & sanitize LLM output ────────────────────────────────────
  const REQUIRED = [
    'name', 'subtitle', 'description', 'tone_keywords',
    'system_prompt_fragment', 'intro_line', 'content_guardrails', 'avatar_initials',
  ];
  const missing = REQUIRED.filter(f => !generated[f]);
  if (missing.length > 0) {
    console.error('LLM output missing fields:', missing, generated);
    return res.status(502).json({
      error:  'Narrator generation incomplete',
      detail: `Missing fields: ${missing.join(', ')}`,
    });
  }

  if (!generated.name.startsWith('The ')) generated.name = `The ${generated.name}`;
  if (generated.description.length > 60)  generated.description = generated.description.slice(0, 57) + '…';

  generated.avatar_initials = generated.avatar_initials.slice(0, 2).toUpperCase();

  if (!Array.isArray(generated.tone_keywords)) {
    generated.tone_keywords = String(generated.tone_keywords).split(',').map(s => s.trim());
  }

  // ── 6. Persist to user_narrators ─────────────────────────────────────────
  const { data: saved, error: insertErr } = await supabase
    .from('user_narrators')
    .insert({
      user_id,
      name:                   generated.name,
      subtitle:               generated.subtitle,
      description:            generated.description,
      tone_keywords:          generated.tone_keywords,
      system_prompt_fragment: generated.system_prompt_fragment,
      content_rating,
      voice_id: null, // caller assigns a voice from voice_configs after creation
    })
    .select()
    .single();

  if (insertErr) {
    console.error('DB insert error:', insertErr);
    return res.status(500).json({ error: 'Failed to save narrator' });
  }

  // ── 7. Return full narrator (including fields not persisted in DB) ─────────
  return res.status(201).json({
    narrator: {
      ...saved,
      intro_line:         generated.intro_line,
      content_guardrails: generated.content_guardrails,
      avatar_initials:    generated.avatar_initials,
    },
    remaining_today: MAX_DAILY - (count + 1),
  });
});

module.exports = router;
