-- =====================================================================
-- 20260514000006_narration_plays.sql
--
-- WHAT
--   Creates the `narration_plays` table per the Narration & Curation
--   Addendum §9.2. Logs every narration playback event so the three
--   feedback reports (§9.3) can compute skip rate, played-through %,
--   skip-clustering, and Tell-Me-More tap rate.
--
--   Each row records one play of one narration. A play is for either a
--   POI narration or a region narration — never both. Enforced by the
--   `poi_or_region_present` CHECK constraint.
--
--   Schema (per addendum §9.2):
--     id                  uuid PK
--     user_id             uuid → auth.users(id)
--     trip_id             uuid → trips(id)
--     poi_id              uuid → pois(id)        -- nullable; either this OR region_id
--     region_id           uuid → regions(id)     -- nullable; either this OR poi_id
--     narration_audio_id  uuid → narration_audio(id)
--     played_at           timestamptz NOT NULL DEFAULT now()
--     audio_duration_ms   integer NOT NULL
--     played_through_ms   integer NOT NULL       -- 0 if skipped immediately
--     was_skipped         boolean NOT NULL DEFAULT false
--     skipped_at_second   integer                -- nullable; populated when was_skipped
--     tell_me_more_tapped boolean NOT NULL DEFAULT false
--
--   FK behavior:
--     - user_id   ON DELETE SET NULL — keep playback history when user deletes account (analytics)
--     - trip_id   ON DELETE SET NULL — same
--     - poi_id    ON DELETE SET NULL — keep history when a POI is deleted (rare)
--     - region_id ON DELETE SET NULL — keep history when a region is replaced
--     - narration_audio_id ON DELETE SET NULL — narration_audio has 30-day TTL
--
--   Privacy: per addendum §9.4, only authenticated users generate rows.
--   Anonymous playback does not log. The "Learn from my taps" auto-tuning
--   is opt-in (default off). Aggregated stats for content quality are
--   non-identifying.
--
--   Indexes:
--     idx_narration_plays_poi        b-tree on poi_id  (per-POI health report)
--     idx_narration_plays_user       b-tree on user_id (per-user nudges)
--     idx_narration_plays_played_at  b-tree on played_at (time-range queries)
--
--   No updated_at — narration_plays rows are insert-only (played_at is
--   the only timestamp).
--
--   RLS:
--     - service_role bypasses RLS (cron jobs + admin dashboard)
--     - authenticated users can SELECT their own rows only (privacy)
--     - INSERT path goes through the WS server using service_role; clients
--       do not write directly to this table
--
-- APPLIED
--   Applied via Supabase Studio web UI on YYYY-MM-DD — fill in after manual apply
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.narration_plays (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        REFERENCES auth.users(id)         ON DELETE SET NULL,
  trip_id             uuid        REFERENCES public.trips(id)       ON DELETE SET NULL,
  poi_id              uuid        REFERENCES public.pois(id)        ON DELETE SET NULL,
  region_id           uuid        REFERENCES public.regions(id)     ON DELETE SET NULL,
  narration_audio_id  uuid        REFERENCES public.narration_audio(id) ON DELETE SET NULL,
  played_at           timestamptz NOT NULL DEFAULT now(),
  audio_duration_ms   integer     NOT NULL,
  played_through_ms   integer     NOT NULL,
  was_skipped         boolean     NOT NULL DEFAULT false,
  skipped_at_second   integer,
  tell_me_more_tapped boolean     NOT NULL DEFAULT false
);

-- One of poi_id / region_id must be set. Enforced separately from the
-- column defs (PG won't let us inline this multi-column CHECK with
-- ADD COLUMN), via DO block for idempotency.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.narration_plays'::regclass
       AND conname  = 'narration_plays_poi_or_region_present'
  ) THEN
    ALTER TABLE public.narration_plays
      ADD CONSTRAINT narration_plays_poi_or_region_present
      CHECK (poi_id IS NOT NULL OR region_id IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.narration_plays'::regclass
       AND conname  = 'narration_plays_durations_nonneg'
  ) THEN
    ALTER TABLE public.narration_plays
      ADD CONSTRAINT narration_plays_durations_nonneg
      CHECK (
        audio_duration_ms >= 0
        AND played_through_ms >= 0
        AND played_through_ms <= audio_duration_ms
        AND (skipped_at_second IS NULL OR skipped_at_second >= 0)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_narration_plays_poi
  ON public.narration_plays (poi_id) WHERE poi_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_narration_plays_user
  ON public.narration_plays (user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_narration_plays_played_at
  ON public.narration_plays (played_at);

ALTER TABLE public.narration_plays ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their own rows only. service_role bypasses.
-- Anonymous role has no policy → no access.
DROP POLICY IF EXISTS narration_plays_own_rows ON public.narration_plays;
CREATE POLICY narration_plays_own_rows
  ON public.narration_plays
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies — service_role bypasses RLS for the
-- WS server write path; nothing else can mutate.

COMMIT;

-- ---------------------------------------------------------------------
-- Verification (run separately after COMMIT):
--
--   SELECT to_regclass('public.narration_plays');
--   -- Expect: public.narration_plays
--
--   SELECT indexname FROM pg_indexes
--    WHERE schemaname = 'public' AND tablename = 'narration_plays'
--    ORDER BY indexname;
--   -- Expect: idx_narration_plays_played_at, idx_narration_plays_poi,
--   --         idx_narration_plays_user, narration_plays_pkey
--
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'public.narration_plays'::regclass
--      AND contype  = 'c'
--    ORDER BY conname;
--   -- Expect: narration_plays_durations_nonneg, narration_plays_poi_or_region_present
--
--   SELECT polname FROM pg_policy
--    WHERE polrelid = 'public.narration_plays'::regclass
--    ORDER BY polname;
--   -- Expect: narration_plays_own_rows
-- ---------------------------------------------------------------------
