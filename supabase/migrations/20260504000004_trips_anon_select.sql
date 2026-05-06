-- Allow anonymous users to read back their own null-user_id trips.
-- Without this, INSERT...RETURNING fails for anon inserts because
-- auth.uid() = NULL evaluates to NULL (not TRUE) in the existing policy.
CREATE POLICY "trips_anon_select"
  ON trips FOR SELECT
  USING (user_id IS NULL);
