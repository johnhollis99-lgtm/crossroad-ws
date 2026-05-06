-- ============================================================
-- trips table — active trip sessions with narrator configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS trips (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  route_id         text,
  route_name       text,
  origin           text,
  destination      text,
  distance_mi      float,
  duration_min     int,
  narrator_id      uuid        REFERENCES narrators(id) ON DELETE SET NULL,
  user_narrator_id uuid        REFERENCES user_narrators(id) ON DELETE SET NULL,
  narrator_name    text,
  depth            text        NOT NULL DEFAULT 'ride_along'
                     CONSTRAINT trips_depth_check
                     CHECK (depth IN ('glance', 'ride_along', 'deep_dive')),
  category_filter  text[]      NOT NULL DEFAULT '{}',
  poi_distance_m   int         NOT NULL DEFAULT 500,
  status           text        NOT NULL DEFAULT 'pending'
                     CONSTRAINT trips_status_check
                     CHECK (status IN ('pending', 'active', 'completed', 'abandoned')),
  started_at       timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trips_user_id_idx ON trips (user_id);
CREATE INDEX IF NOT EXISTS trips_status_idx  ON trips (status);

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

-- Authenticated users own their trips
CREATE POLICY "trips_user_own"
  ON trips FOR ALL
  USING (auth.uid() = user_id);

-- Allow anonymous inserts (app has no auth yet — user_id will be null)
CREATE POLICY "trips_anon_insert"
  ON trips FOR INSERT
  WITH CHECK (user_id IS NULL);
