-- Migration 1 — user_preferences auto-create on signup + backfill.
--
-- The table now exists in the migration system (Migration 0), but it has 0
-- rows. auth.users also has 0 rows today. The trigger is the lasting value
-- here — future signups get preferences rows automatically. The backfill is
-- a defensive no-op at current row counts; correct once auth.users is
-- populated.

CREATE OR REPLACE FUNCTION public.handle_new_user_preferences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.user_preferences (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created_preferences ON auth.users;
CREATE TRIGGER on_auth_user_created_preferences
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_preferences();

-- Backfill: no-op today (auth.users empty); correct when populated.
INSERT INTO public.user_preferences (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
