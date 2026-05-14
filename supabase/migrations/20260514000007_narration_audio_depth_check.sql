-- =====================================================================
-- 20260514000007_narration_audio_depth_check.sql
--
-- WHAT
--   Extends the `na_depth_check` constraint on `narration_audio.depth`
--   to accept the new value space from the Narration & Curation Addendum
--   §4.4 alongside the existing legacy values.
--
--   Before:  CHECK (depth IN ('glance', 'ride_along', 'deep_dive'))
--   After:   CHECK (depth IN ('glance', 'ride_along', 'deep_dive',
--                             'brief', 'standard', 'long', 'long_compressed'))
--
--   The constraint was originally defined in
--   `20260504000003_narration_cache.sql:42` as `na_depth_check`.
--
--   Existing rows are NOT migrated (per the chosen Q1 path: "Extend
--   CHECK only — keep old rows as-is"). The app reads with an alias
--   mapping at the application layer:
--     glance       ↔ brief
--     ride_along   ↔ standard
--     deep_dive    ↔ long
--   Storage paths in `narration_audio.audio_url` stay valid because
--   path strings are content-addressed and bucket-side URLs don't
--   change. The narration worker reads the (poi_id, narrator_slug,
--   depth, mode) UNIQUE row and serves whichever depth value was
--   written; the alias mapping happens before the lookup.
--
--   The new value `long_compressed` is the Light Touch variant of long
--   POIs (addendum §6.2). Writers will populate this when generating
--   ~90-second compressed audio for Pace=Light Touch trips.
--
--   What this migration does NOT touch:
--     - trips.depth          (trips_depth_check, CHECK ∈ 3 old values)
--       — Pace replaces user-facing depth selection; trips.depth
--         becomes vestigial. Cleanup deferred to a coordinated UI/
--         schema change (roadmap Phase J).
--     - user_preferences.default_depth (depth_valid CHECK ∈ 3 old values)
--       — same rationale.
--     - voice_configs        — narrator_slug column + (mode, narrator_slug)
--                              unique index swap is deferred to Phase D3
--                              when the 8 new voice rows ship as one
--                              coordinated change (column + index + data).
--
--   Live audit (2026-05-14 pre-apply):
--     na_depth_check definition:
--       CHECK ((depth = ANY (ARRAY['glance','ride_along','deep_dive'])))
--     narration_audio row count: pending live count
--
--   Posture: DROP + bare ADD inside BEGIN/COMMIT — the same pattern as
--   the venue_type-to-mode CHECK extension precedent in
--   `20260510000005_na_unique_add_mode.sql` (which widened the na_unique
--   constraint by drop+add). Avoids the `CREATE OR REPLACE` trap (PG
--   has no equivalent for CHECK constraints).
--
-- APPLIED
--   Applied via direct pg connection on 2026-05-14. Verified: na_depth_check
--   now allows the 7-value union {glance, ride_along, deep_dive, brief,
--   standard, long, long_compressed}. Existing 37 narration_audio rows all
--   hold 'deep_dive' (LA→Cambria smoke batch) — untouched by this migration.
-- =====================================================================

BEGIN;

-- Drop the 3-value CHECK. IF EXISTS so the migration is idempotent —
-- re-running first drops the 7-value form (if a prior partial apply
-- left it), then re-adds the same 7-value form.
ALTER TABLE public.narration_audio
  DROP CONSTRAINT IF EXISTS na_depth_check;

-- Add the 7-value union. Bare ADD CONSTRAINT — errors loudly if a
-- constraint of the same name somehow survives the DROP above.
ALTER TABLE public.narration_audio
  ADD CONSTRAINT na_depth_check
  CHECK (depth IN (
    'glance',
    'ride_along',
    'deep_dive',
    'brief',
    'standard',
    'long',
    'long_compressed'
  ));

COMMIT;

-- ---------------------------------------------------------------------
-- Verification (run separately after COMMIT):
--
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'public.narration_audio'::regclass
--      AND conname  = 'na_depth_check';
--   -- Expect: na_depth_check
--   --   CHECK ((depth = ANY (ARRAY['glance'::text, 'ride_along'::text,
--   --     'deep_dive'::text, 'brief'::text, 'standard'::text,
--   --     'long'::text, 'long_compressed'::text])))
--
--   -- Existing rows untouched — should still hold the legacy values:
--   SELECT depth, COUNT(*) FROM public.narration_audio
--    GROUP BY depth ORDER BY COUNT(*) DESC;
--   -- Expect: only legacy values populated (glance / ride_along / deep_dive)
--   --         until the lookahead worker starts writing new-value rows.
-- ---------------------------------------------------------------------
