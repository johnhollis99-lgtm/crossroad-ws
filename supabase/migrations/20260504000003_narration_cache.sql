-- ============================================================
-- Narration audio cache
--
-- Cache key: (poi_id, narrator_slug, depth)
--   • Preset narrators  → slug from narrators.slug   (is_shared_cache = true)
--   • User narrators    → slug from user_narrators.slug (is_shared_cache = false)
--
-- Creates:
--   • user_narrators.slug computed column
--   • narration_audio table
--   • RPC get_cached_narration
--   • RPC cache_narration
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Add generated slug to user_narrators
--
-- Produces deterministic slugs like: user-550e8400e29b41d4a716446655440000
-- Safe to generate here because user_narrators was created in an earlier
-- migration and no existing data will conflict.
-- ────────────────────────────────────────────────────────────

ALTER TABLE user_narrators
  ADD COLUMN IF NOT EXISTS slug text
    GENERATED ALWAYS AS ('user-' || REPLACE(id::text, '-', '')) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS user_narrators_slug_idx ON user_narrators (slug);

-- ────────────────────────────────────────────────────────────
-- 2. narration_audio
--
-- Stores generated audio for a (poi, narrator, depth) triple.
-- Shared cache entries (preset narrators) serve all users.
-- Private entries (user narrators) are scoped to one user.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS narration_audio (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  poi_id          uuid        NOT NULL REFERENCES pois(id) ON DELETE CASCADE,
  narrator_slug   text        NOT NULL,
  depth           text        NOT NULL
                    CONSTRAINT na_depth_check
                    CHECK (depth IN ('glance', 'ride_along', 'deep_dive')),
  audio_url       text        NOT NULL,
  is_shared_cache boolean     NOT NULL DEFAULT true,
  user_id         uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  generated_at    timestamptz NOT NULL DEFAULT now(),

  -- Private caches must carry the owning user
  CONSTRAINT na_private_has_user
    CHECK (is_shared_cache = true OR user_id IS NOT NULL),

  -- One cache entry per (poi, narrator, depth) combination
  CONSTRAINT na_unique UNIQUE (poi_id, narrator_slug, depth)
);

-- narrator_slug + depth: primary lookup pattern (is this narration cached?)
CREATE INDEX IF NOT EXISTS na_narrator_depth_idx
  ON narration_audio (narrator_slug, depth);

-- poi_id: used when invalidating all caches for a POI
CREATE INDEX IF NOT EXISTS na_poi_id_idx
  ON narration_audio (poi_id);

-- user_id: used when purging a user's private cache on account deletion
CREATE INDEX IF NOT EXISTS na_user_id_idx
  ON narration_audio (user_id)
  WHERE user_id IS NOT NULL;

-- generated_at: used by the 30-day expiry filter and future cleanup jobs
CREATE INDEX IF NOT EXISTS na_generated_at_idx
  ON narration_audio (generated_at DESC);

ALTER TABLE narration_audio ENABLE ROW LEVEL SECURITY;

-- Shared (preset narrator) caches are readable by everyone
CREATE POLICY "na_shared_read"
  ON narration_audio FOR SELECT
  USING (is_shared_cache = true);

-- Private (user narrator) caches are readable only by their owner
CREATE POLICY "na_private_read"
  ON narration_audio FOR SELECT
  USING (is_shared_cache = false AND auth.uid() = user_id);

-- All writes go through the SECURITY DEFINER RPC — no direct client writes
-- (no INSERT / UPDATE / DELETE policies needed)


-- ============================================================
-- RPCs
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- RPC: get_cached_narration
--
-- Returns the audio_url for a cached narration, or NULL if:
--   • no entry exists, or
--   • the entry is older than 30 days, or
--   • the entry is a private cache that doesn't belong to p_user_id
--
-- Called from the app before requesting a new narration generation.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_cached_narration(
  p_poi_id        uuid,
  p_narrator_slug text,
  p_depth         text,
  p_user_id       uuid DEFAULT NULL
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT audio_url
  FROM   narration_audio
  WHERE  poi_id        = p_poi_id
    AND  narrator_slug = p_narrator_slug
    AND  depth         = p_depth
    AND  generated_at  > now() - INTERVAL '30 days'
    AND  (
      is_shared_cache = true
      OR user_id      = p_user_id
    )
  LIMIT 1;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: cache_narration
--
-- Upserts a narration_audio record. Sets generated_at = now() on
-- both insert and update (refreshes the 30-day TTL on re-generation).
--
-- Shared vs private is determined automatically:
--   • slug found in narrators (is_preset = true)  → shared, user_id = NULL
--   • anything else (user narrator slug)          → private, user_id = p_user_id
--
-- Called from the server (narration-engine) after audio is generated.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cache_narration(
  p_poi_id        uuid,
  p_narrator_slug text,
  p_depth         text,
  p_audio_url     text,
  p_user_id       uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_shared boolean;
  v_row_id    uuid;
BEGIN
  -- Preset narrator slugs live in the narrators table; everything else is user-specific
  v_is_shared := EXISTS (
    SELECT 1 FROM narrators
    WHERE  slug     = p_narrator_slug
      AND  is_preset = true
  );

  INSERT INTO narration_audio (
    poi_id, narrator_slug, depth, audio_url,
    is_shared_cache, user_id, generated_at
  )
  VALUES (
    p_poi_id,
    p_narrator_slug,
    p_depth,
    p_audio_url,
    v_is_shared,
    CASE WHEN v_is_shared THEN NULL ELSE p_user_id END,
    now()
  )
  ON CONFLICT (poi_id, narrator_slug, depth)
  DO UPDATE SET
    audio_url    = EXCLUDED.audio_url,
    generated_at = now()
  RETURNING id INTO v_row_id;

  RETURN v_row_id;
END;
$$;
