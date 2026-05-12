-- 20260511000005_trips_route_id_drop.sql
--
-- Resolves drift catalog entry 5.27 Path 3 (`trips.route_id` is text,
-- no FK, unconstrained — junk-write column with zero readers).
--
-- Drops the `trips.route_id text` column. The column predates any
-- corridor / routes association feature and was being populated as a
-- sentinel by [app/index.tsx](../../app/index.tsx) (hardcoded `id: ''`)
-- flowing through [app/customize.tsx](../../app/customize.tsx) into
-- `saveTrip` in [lib/supabase.ts](../../lib/supabase.ts). Same shape as
-- 5.16: zero readers, drop-and-rebuild-later posture. The type (`text`)
-- is wrong for any plausible target (`corridors.id` and `routes.id` are
-- both `uuid`), so a future feature wiring trips→route will rebuild
-- with the correct type and FK rather than coerce `''` sentinels.
--
-- Pre-flight (per drift catalog 5.27 live-state notes, verified
-- 2026-05-11 against staging):
--
--   SELECT route_id, count(*) FROM public.trips GROUP BY route_id;
--   → '': 31
--   → NULL: 1
--   (zero meaningful values; 100% sentinel or NULL)
--
--   Code-side audit (rg over app/, server/, scripts/, admin/, lib/):
--   zero readers of `trips.route_id`. Three write sites only —
--   [app/index.tsx:529](../../app/index.tsx#L529) (object-literal `id: ''`),
--   [app/customize.tsx:477](../../app/customize.tsx#L477) (`routeId` payload field),
--   [lib/supabase.ts:236](../../lib/supabase.ts#L236) (`route_id` INSERT column).
--   All three are removed in the same commit as this migration.
--
--   pg_depend lookup: zero view / RPC / trigger / generated-column
--   dependencies on `trips.route_id`.
--
-- Default RESTRICT (no CASCADE) on the DROP so any dependency the
-- pre-flight missed fails loudly at migration time rather than
-- silently nuking dependents.

BEGIN;

ALTER TABLE public.trips
  DROP COLUMN route_id;

COMMIT;

-- Verification (re-run post-apply):
--   SELECT column_name
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name = 'trips'
--      AND column_name = 'route_id';
--   → 0 rows
