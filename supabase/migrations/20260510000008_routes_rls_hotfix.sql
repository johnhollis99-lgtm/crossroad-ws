-- 20260510000008_routes_rls_hotfix.sql
--
-- Resolves drift catalog entries 5.20 (public-ALL/true policy on `routes`)
-- and 5.21 (`routes.user_id` is text/nullable with no FK to auth.users).
-- See docs/audit-rls-drift.md and docs/audit-routes-rls.md.
--
-- Live row count is 0 (the 5 NULL-user_id rows from prior dev work were
-- deleted out-of-band — see docs/decision-needed-routes-orphans.md). With no
-- live rows there is no DELETE block in this migration; the cast is over an
-- empty table.
--
-- auth.users is also empty (0 rows), so the new FK constraint applies to
-- nothing today; it gates future inserts only.
--
-- Pre-flight verification (re-run before applying):
--   SELECT count(*) FROM public.routes;            -- expect 0
--   SELECT count(*) FROM auth.users;               -- expect 0 today (gate works regardless)
--   SELECT policyname FROM pg_policies WHERE tablename='routes';
--   -- expect: 'Routes are public'
--   SELECT data_type, is_nullable FROM information_schema.columns
--    WHERE table_name='routes' AND column_name='user_id';
--   -- expect: text | YES
--
-- Pattern mirrors supabase/migrations/20260510000001_user_preferences_capture.sql.

BEGIN;

DROP POLICY IF EXISTS "Routes are public" ON public.routes;

ALTER TABLE public.routes
  ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

ALTER TABLE public.routes
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.routes
  ADD CONSTRAINT routes_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY routes_select_own ON public.routes
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY routes_insert_own ON public.routes
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY routes_update_own ON public.routes
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY routes_delete_own ON public.routes
  FOR DELETE USING (user_id = auth.uid());

COMMIT;

-- Verification (re-run post-apply):
--   SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename='routes';
--   → expect 4 rows: routes_select_own (SELECT, qual auth.uid()=user_id),
--                    routes_insert_own (INSERT, with_check),
--                    routes_update_own (UPDATE, qual + with_check),
--                    routes_delete_own (DELETE, qual)
--   SELECT data_type, is_nullable FROM information_schema.columns
--    WHERE table_name='routes' AND column_name='user_id';
--   → expect: uuid | NO
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid='public.routes'::regclass AND contype='f';
--   → expect: routes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
