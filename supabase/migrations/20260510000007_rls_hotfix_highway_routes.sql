-- 20260510000007_rls_hotfix_highway_routes.sql
--
-- Hotfix: enable RLS on `highway_routes` and add an explicit public-read
-- policy. The table was created in 20260504000006 without any RLS setup,
-- which means anonymous callers (anyone with the EXPO_PUBLIC anon key) can
-- SELECT, INSERT, UPDATE, and DELETE its 221 rows of CA highway geometries.
--
-- This is Category B (catalog / public-read reference data) per
-- docs/audit-rls-drift.md. The intended access shape mirrors `pois`,
-- `poi_categories`, and `corridors`:
--   * Public SELECT (USING true) — anyone can read.
--   * No public INSERT/UPDATE/DELETE policy — only `service_role` can write,
--     because Postgres defaults to deny-all once RLS is on and no policy
--     covers a given command. The seed-highway-routes.ts script already
--     uses SUPABASE_SERVICE_ROLE_KEY, so writes continue to work without
--     code changes.
--
-- No data migration: the 221 existing rows are valid catalog data and stay.
--
-- Pre-flight verification (run before applying):
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.highway_routes'::regclass;
--   → false (current state, will become true)
--   SELECT count(*) FROM pg_policies WHERE tablename = 'highway_routes';
--   → 0 (current state, will become 1)
--
-- ⚠️ This migration is STAGED only. Do not apply without re-running the
-- triage in docs/audit-rls-drift.md and confirming the highway_routes shape
-- hasn't changed underneath us.

BEGIN;

ALTER TABLE public.highway_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read highway_routes" ON public.highway_routes;
CREATE POLICY "Public read highway_routes"
  ON public.highway_routes
  FOR SELECT
  USING (true);

COMMIT;

-- Verification (re-run post-apply):
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.highway_routes'::regclass;
--   → expect: true
--   SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'highway_routes';
--   → expect 1 row: "Public read highway_routes" / SELECT / true
-- Smoke test under anon key (PostgREST /rest/v1/highway_routes):
--   GET   → 200, returns rows
--   POST  → 401/403 (no INSERT policy for anon)
--   PATCH → 401/403
--   DELETE→ 401/403
