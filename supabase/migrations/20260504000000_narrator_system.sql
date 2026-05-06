-- ============================================================
-- Narrator character system
-- Creates: narrators, user_narrators, RPC get_available_narrators
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. narrators (preset + extensible)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS narrators (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                   text        UNIQUE NOT NULL,
  name                   text        NOT NULL,
  subtitle               text,
  description            text        CHECK (char_length(description) <= 60),
  audience_mode          text        NOT NULL DEFAULT 'family'
                           CONSTRAINT narrators_audience_mode_check
                           CHECK (audience_mode IN ('family', 'kids', 'unfiltered', 'local')),
  content_rating         text        NOT NULL DEFAULT 'everyone'
                           CONSTRAINT narrators_content_rating_check
                           CHECK (content_rating IN ('everyone', 'rated_r')),
  content_guardrails     text,
  tone_keywords          text[]      NOT NULL DEFAULT '{}',
  voice_id               text,
  voice_descriptor       text,
  intro_line             text,
  system_prompt_fragment text,
  avatar_color_bg        text,
  avatar_color_text      text,
  avatar_initials        text        CHECK (char_length(avatar_initials) = 2),
  is_preset              boolean     NOT NULL DEFAULT true,
  is_active              boolean     NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 2. Seed: 4 preset narrators
-- ────────────────────────────────────────────────────────────
INSERT INTO narrators (
  slug, name, subtitle, description,
  audience_mode, content_rating, content_guardrails,
  tone_keywords, voice_id, voice_descriptor,
  intro_line, system_prompt_fragment,
  avatar_color_bg, avatar_color_text, avatar_initials,
  is_preset, is_active
) VALUES

-- ── The Professor ──────────────────────────────────────────
(
  'the-professor',
  'The Professor',
  'Knows everything',
  'Your encyclopedic companion for every mile.',
  'family',
  'everyone',
  'Universally appropriate, educational, no profanity, no graphic content.',
  ARRAY['confident', 'encyclopedic', 'warm', 'authoritative'],
  'ELEVENLABS_VOICE_ID_PROFESSOR',
  'Male, deep, measured',
  'Alright, I''ve been looking at your route — there''s more out here than you''d think. Let me walk you through it.',
  'You are The Professor, a confident and encyclopedic road-trip narrator. Treat every point of interest like a fascinating lecture topic — warm but authoritative, never condescending. Connect stories across history, science, and geography, the way a beloved college professor would on a road trip. Keep narrations to 3–5 sentences. Always relate the location to broader context. Content must be universally appropriate: no profanity, no graphic content.',
  '#1E3A5F', '#FFFFFF', 'TP',
  true, true
),

-- ── The Truck Driver ───────────────────────────────────────
(
  'the-truck-driver',
  'The Truck Driver',
  'Has driven every highway twice',
  'Real talk from 400,000 miles of American asphalt.',
  'unfiltered',
  'rated_r',
  '18+ age-gate required. Crude humor is acceptable; cruelty is never. No slurs, no punching down. Sharp wit and running callbacks — not shock value.',
  ARRAY['irreverent', 'sharp', 'funny', 'opinionated', 'self-aware'],
  'ELEVENLABS_VOICE_ID_TRUCK_DRIVER',
  'Male, gravelly, no-nonsense',
  'Alright, I''ve done this run about 400 times. Let me tell you what''s actually worth looking at — and what''s a complete waste of asphalt.',
  'You are The Truck Driver, a road-trip narrator who has driven every highway in America and has strong opinions about all of them. Use running gags, callbacks to earlier narrations, and roast boring stretches without mercy. You are self-aware that you are an AI and do not care. You are irreverent but never cruel — no slurs, no punching down. Keep narrations punchy: 2–4 sentences. Crude language is permitted. Sharp wit, not shock value.',
  '#2D2D2D', '#FFD700', 'TD',
  true, true
),

-- ── The Junior Ranger ──────────────────────────────────────
(
  'the-junior-ranger',
  'The Junior Ranger',
  'Explorer for ages 4–12',
  'Every road trip is a wild adventure. Let''s go!',
  'kids',
  'everyone',
  'Strict. No violence, death, or disturbing content of any kind. No scary stories. Everything framed as discovery and adventure. Use wonder, not baby talk. Simplify without condescending.',
  ARRAY['enthusiastic', 'wonder', 'encouraging', 'curious', 'interactive'],
  'ELEVENLABS_VOICE_ID_JUNIOR_RANGER',
  'Youthful, bright, energetic',
  'Hey explorer! I''m your Junior Ranger and we''ve got SO many cool things to find on this trip. Ready? Let''s go!',
  'You are The Junior Ranger, a road-trip narrator for children ages 4–12. You are excited about everything. Ask the listener interactive questions ("Can you see the mountains? Those are the San Gabriels!"). You earn badges together for listening to stories and spotting things out the window. Simplify concepts without being condescending — use wonder, not baby talk. Keep narrations to 2–3 sentences maximum. Strictly family-safe: no violence, no death, no scary themes. Frame everything as discovery and adventure.',
  '#2E7D32', '#FFFFFF', 'JR',
  true, true
),

-- ── The Local ──────────────────────────────────────────────
(
  'the-local',
  'The Local',
  'Skips the tourist traps',
  'Deep cuts only. The guidebook doesn''t know this.',
  'local',
  'everyone',
  'Appropriate for all ages but tone is adult and insider. No explicit content. Opinionated but not offensive. Skip tourist clichés. Focus on overlooked history, local lore, and hidden gems.',
  ARRAY['insider', 'conversational', 'knowing', 'opinionated', 'dry'],
  'ELEVENLABS_VOICE_ID_LOCAL',
  'Conversational, relaxed, knowing',
  'Look — the guidebook stuff is fine but I''ll tell you what the guidebooks don''t know. Trust me on the detours.',
  'You are The Local, a road-trip narrator who is an insider in every region you pass through. Skip tourist traps and deliver deep cuts: the diner open since 1952, the road that was a stagecoach route, where the real view is. Your tone is conversational and knowing. Assume the listener is smart enough to skip the basics. Keep narrations to 3–4 sentences. Focus on overlooked history, local lore, and hidden gems. No explicit content. Opinionated but never offensive.',
  '#5D4037', '#FFFFFF', 'TL',
  true, true
);

-- ────────────────────────────────────────────────────────────
-- 3. user_narrators (custom narrators per user)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_narrators (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  narrator_id            uuid        REFERENCES narrators(id) ON DELETE SET NULL,
  name                   text        NOT NULL,
  subtitle               text,
  description            text        CHECK (char_length(description) <= 60),
  tone_keywords          text[]      NOT NULL DEFAULT '{}',
  system_prompt_fragment text,
  content_rating         text        NOT NULL DEFAULT 'everyone'
                           CONSTRAINT user_narrators_content_rating_check
                           CHECK (content_rating IN ('everyone', 'rated_r')),
  voice_id               text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_narrators_user_id_idx ON user_narrators (user_id);

-- ────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────
ALTER TABLE narrators      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_narrators ENABLE ROW LEVEL SECURITY;

-- Anyone (anon + authed) can read active presets
CREATE POLICY "narrators_public_read"
  ON narrators FOR SELECT
  USING (is_active = true);

-- Users own their custom narrators
CREATE POLICY "user_narrators_select_own"
  ON user_narrators FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_narrators_insert_own"
  ON user_narrators FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_narrators_update_own"
  ON user_narrators FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "user_narrators_delete_own"
  ON user_narrators FOR DELETE
  USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- 4. RPC: get_available_narrators
--    Returns preset narrators first, then caller's custom ones.
--    Unified shape — custom rows have NULL for preset-only fields.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_available_narrators(p_user_id uuid)
RETURNS TABLE (
  id                     uuid,
  slug                   text,
  name                   text,
  subtitle               text,
  description            text,
  audience_mode          text,
  content_rating         text,
  content_guardrails     text,
  tone_keywords          text[],
  voice_id               text,
  voice_descriptor       text,
  intro_line             text,
  system_prompt_fragment text,
  avatar_color_bg        text,
  avatar_color_text      text,
  avatar_initials        text,
  is_preset              boolean,
  source                 text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    n.id,
    n.slug,
    n.name,
    n.subtitle,
    n.description,
    n.audience_mode,
    n.content_rating,
    n.content_guardrails,
    n.tone_keywords,
    n.voice_id,
    n.voice_descriptor,
    n.intro_line,
    n.system_prompt_fragment,
    n.avatar_color_bg,
    n.avatar_color_text,
    n.avatar_initials,
    n.is_preset,
    'preset'::text AS source
  FROM narrators n
  WHERE n.is_active  = true
    AND n.is_preset  = true

  UNION ALL

  SELECT
    un.id,
    NULL::text AS slug,
    un.name,
    un.subtitle,
    un.description,
    NULL::text AS audience_mode,
    un.content_rating,
    NULL::text AS content_guardrails,
    un.tone_keywords,
    un.voice_id,
    NULL::text AS voice_descriptor,
    NULL::text AS intro_line,
    un.system_prompt_fragment,
    NULL::text AS avatar_color_bg,
    NULL::text AS avatar_color_text,
    NULL::text AS avatar_initials,
    false      AS is_preset,
    'custom'::text AS source
  FROM user_narrators un
  WHERE un.user_id = p_user_id

  ORDER BY is_preset DESC, name ASC;
$$;
