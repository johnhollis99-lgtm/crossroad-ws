-- ============================================================
-- Migration: pois.narration_cache jsonb column + update RPC
--
-- narration_cache is an O(1) lookup on the POI row itself,
-- checked BEFORE the narration_audio table in useTTS.ts.
-- Shape: { "{mode}-{depth}-{voice_id}": "{audio_url}" }
--
-- update_poi_narration_cache does an atomic jsonb merge so
-- concurrent writers don't clobber each other's keys.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. narration_cache column
-- ─────────────────────────────────────────────────────────────

ALTER TABLE pois
  ADD COLUMN IF NOT EXISTS narration_cache jsonb NOT NULL DEFAULT '{}';

-- GIN index for future key-existence queries (optional but cheap)
CREATE INDEX IF NOT EXISTS pois_narration_cache_gin_idx
  ON pois USING gin (narration_cache);

-- ─────────────────────────────────────────────────────────────
-- 2. update_poi_narration_cache RPC
--
-- Atomically merges a single key into pois.narration_cache.
-- Called by:
--   • server/routes/narration.js after upload (fire-and-forget)
--   • scripts/precache-popular-routes.ts after generation
--
-- Using jsonb || operator so the UPDATE is a single atomic
-- statement — no read-modify-write race.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_poi_narration_cache(
  p_poi_id   uuid,
  p_cache_key text,   -- e.g. "driving-ride_along-en-US-Chirp3-HD-Aoede"
  p_audio_url text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE pois
  SET    narration_cache = narration_cache || jsonb_build_object(p_cache_key, p_audio_url)
  WHERE  id = p_poi_id;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. anon SELECT policy for voice_configs (is_active rows only)
--
-- useTTS.ts reads voice_configs via the anon key to resolve
-- the active voice for a given mode. Without this policy the
-- hook falls back silently to the hardcoded default voice.
-- ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'voice_configs' AND policyname = 'anon_select_active_voice_configs'
  ) THEN
    CREATE POLICY "anon_select_active_voice_configs"
      ON voice_configs FOR SELECT
      TO anon
      USING (is_active = true);
  END IF;
END $$;
