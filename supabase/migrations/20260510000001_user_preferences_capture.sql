-- Migration 0 — capture user_preferences (and its trigger function) into the
-- migration system.
--
-- Background:
--   - The user_preferences table exists in production but does not appear in
--     any migration file. `supabase db reset` would not recreate it.
--   - The set_updated_at() trigger function it uses is ALSO out-of-band and
--     used today only by user_preferences (verified via pg_trigger).
--   - 0 production rows; auth.users is also empty. This is a schema capture,
--     not a data migration.
--
-- DDL was emitted via Postgres's own helpers in lieu of pg_dump (not on PATH):
--   - information_schema.columns                  → column list + defaults
--   - pg_get_constraintdef(oid)                   → 4 CHECK constraints + FK + PK
--   - pg_get_indexdef(indexrelid::regclass)       → PK index only
--   - pg_get_triggerdef(oid) / pg_get_functiondef → trigger + function bodies
--   - pg_policies                                 → 3 RLS policies, all on auth.uid()
--
-- All operations are idempotent:
--   - Function uses CREATE OR REPLACE
--   - Table uses CREATE TABLE IF NOT EXISTS with inline constraints (no-op
--     against an existing prod table — constraints are inspected only on
--     creation)
--   - Trigger / policies use DROP IF EXISTS then CREATE
--   - RLS enable is naturally idempotent

-- ── Trigger function ────────────────────────────────────────────────────────
-- Generic name; current usage scope is user_preferences only.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ── Table ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_audience_mode    text NOT NULL DEFAULT 'family'::text
    CONSTRAINT audience_mode_valid CHECK (default_audience_mode = ANY (ARRAY['family'::text, 'kids'::text, 'unfiltered'::text, 'local'::text])),
  default_depth            text NOT NULL DEFAULT 'ride_along'::text
    CONSTRAINT depth_valid CHECK (default_depth = ANY (ARRAY['glance'::text, 'ride_along'::text, 'deep_dive'::text])),
  offline_cache_budget_mb  integer NOT NULL DEFAULT 250
    CONSTRAINT cache_budget_sane CHECK ((offline_cache_budget_mb >= 50) AND (offline_cache_budget_mb <= 2000)),
  age_verified_at          timestamptz,
  unfiltered_mode_enabled  boolean NOT NULL DEFAULT false,
  kids_mode_pin_hash       text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unfiltered_requires_age CHECK ((NOT unfiltered_mode_enabled) OR (age_verified_at IS NOT NULL))
);

-- ── Trigger ─────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS user_preferences_updated_at ON public.user_preferences;
CREATE TRIGGER user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user reads own preferences" ON public.user_preferences;
CREATE POLICY "user reads own preferences"
  ON public.user_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user updates own preferences" ON public.user_preferences;
CREATE POLICY "user updates own preferences"
  ON public.user_preferences
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user upserts own preferences" ON public.user_preferences;
CREATE POLICY "user upserts own preferences"
  ON public.user_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
