-- =====================================================================
-- 20260520000003_food_drink_floor_sentinel.sql
--
-- SENTINEL CONVENTION (read this first if you're touching the floors table)
--   Values 0–100 are real significance floors used by the >= comparator
--   in get_corridor_pois / get_nearby_pois.
--   Value 999 is the sentinel for "override-only" categories: rows surface
--   only via editorial_curated OR iconic_local; the score branch is
--   effectively unreachable. Applied first to food_drink (see Joyce's recon).
--
-- WHAT
--   Two coordinated changes on public.category_significance_floors:
--     1. Widens the significance_floor CHECK from (>= 0 AND <= 100) to
--        (>= 0 AND <= 999) so the 999 sentinel can be stored.
--     2. UPDATEs the food_drink row's significance_floor from 0 → 999,
--        rewrites the row's notes to document the sentinel convention.
--
-- WHY
--   The G2 seed (20260519000003) set food_drink=0 with the curator
--   intent that food/drink surfaces ONLY via the editorial_curated or
--   iconic_local override paths (addendum §1.1 Narrative Focus opt-in
--   + §8 Iconic Local Override). But the RPC OR-chain in
--   get_corridor_pois / get_nearby_pois (20260519000004) reads:
--
--     editorial_curated = TRUE
--     OR iconic_local   = TRUE
--     OR significance_score >= GREATEST(COALESCE(floor, 70), min_sig)
--
--   With floor=0 and a `>=` comparator, every food_drink row with any
--   score — including 0.00 — passes the score branch independently of
--   the override branches. Joyce's (id ddb24d8c-c632-4198-bdfd-0271bec2e206,
--   Northridge OSM bulk-import, score=0, no description, no tags, never
--   curated) surfaced on the LA → Mammoth demo route via this gap
--   (recon 2026-05-20).
--
--   Setting the floor to 999 makes the score branch effectively
--   unreachable for food_drink rows (live significance_score values are
--   capped near 100 by the recompute pipeline's per-component caps; no
--   organic path reaches 999). The override branches stay live: any
--   food_drink POI marked editorial_curated = TRUE or iconic_local = TRUE
--   still surfaces regardless. End state matches the curator intent:
--   food/drink is override-only.
--
-- WHY 999 RATHER THAN 100 (the previous cap)
--   100 is the natural ceiling of the recompute breakdown, so a future
--   tuning pass that pushes a food_drink row to exactly 100 would silently
--   re-open the score branch. 999 is reserved as a sentinel — see the
--   header convention above — so the intent ("override-only") is legible
--   on inspection of the row's significance_floor alone, independent of
--   what the rest of the pipeline does with scores.
--
-- PRE-FLIGHT
--   Required dependency: 20260514000004_category_significance_floors.sql
--     created the CHECK we are widening. (We don't depend on any specific
--     prior shape — the DROP IF EXISTS / ADD pattern is safe to run on a
--     table that ever had this CHECK, regardless of whether the seed has
--     been applied.)
--   Required dependency: 20260519000003_category_significance_floors_seed_g2.sql
--     INSERTed the food_drink row this migration UPDATEs.
--   Required dependency: 20260519000004_rpc_pois_floor_and_priority.sql
--     added the floor JOIN to the RPC; the UPDATE is functionally inert
--     without it.
--
-- WHAT NOT TO DO
--   Do NOT edit the G2 seed (20260519000003) in place — retroactive edits
--   to applied migrations create drift between environments. This is a
--   forward-only correction.
--
--   Do NOT delete the food_drink row from category_significance_floors —
--   the row still serves an explicit-floor semantic. (The COALESCE-70
--   fallback would imply a floor of 70, which is a different surfacing
--   posture than the 999 sentinel and would let any moderately-scored
--   food_drink row through.)
--
--   Do NOT extend the CHECK upper bound past 999. 999 is a defined
--   sentinel; bumping it to 9999 or removing the upper bound entirely
--   erodes the constraint's typo-catching value (e.g. catches a future
--   `floor = 1000` migration that probably meant `100`).
-- =====================================================================

BEGIN;

-- 1. Swap the CHECK.
--    DROP IF EXISTS lets this re-run safely (constraint name from
--    20260514000004; ADD CONSTRAINT keeps the same name so the
--    constraint identity stays stable across history).
ALTER TABLE public.category_significance_floors
  DROP CONSTRAINT IF EXISTS category_significance_floors_significance_floor_check;

ALTER TABLE public.category_significance_floors
  ADD CONSTRAINT category_significance_floors_significance_floor_check
  CHECK (significance_floor >= 0 AND significance_floor <= 999);

-- 2. Promote food_drink to the sentinel.
UPDATE public.category_significance_floors
SET significance_floor = 999,
    notes = 'Override-only — set to sentinel 999 so the RPC score branch ' ||
            '(p.significance_score >= GREATEST(COALESCE(floor, 70), min_sig)) ' ||
            'is effectively unreachable. food/drink POIs surface only via ' ||
            'editorial_curated = TRUE or iconic_local = TRUE override branches. ' ||
            'Previous floor=0 was letting zero-signal OSM bulk-imports through ' ||
            'the score branch (see Joyce''s recon, 2026-05-20). The override ' ||
            'paths are independent OR-clauses and remain live. ' ||
            'See sentinel convention in 20260520000003_food_drink_floor_sentinel.sql.'
WHERE category = 'food_drink';

-- 3. Verification — the CHECK swap took, the UPDATE took.
DO $$
DECLARE
  v_floor smallint;
  v_check_def text;
BEGIN
  SELECT pg_get_constraintdef(con.oid)
    INTO v_check_def
  FROM   pg_constraint con
  JOIN   pg_class      tbl ON tbl.oid = con.conrelid
  JOIN   pg_namespace  ns  ON ns.oid  = tbl.relnamespace
  WHERE  ns.nspname = 'public'
    AND  tbl.relname = 'category_significance_floors'
    AND  con.conname = 'category_significance_floors_significance_floor_check';

  IF v_check_def IS NULL THEN
    RAISE EXCEPTION 'CHECK constraint missing after swap';
  END IF;

  IF v_check_def NOT LIKE '%999%' THEN
    RAISE EXCEPTION 'CHECK constraint did not widen to 999; got: %', v_check_def;
  END IF;

  SELECT significance_floor INTO v_floor
  FROM public.category_significance_floors
  WHERE category = 'food_drink';

  IF v_floor IS NULL THEN
    RAISE EXCEPTION 'food_drink row missing from category_significance_floors; expected G2 seed (20260519000003) to have applied first';
  END IF;

  IF v_floor <> 999 THEN
    RAISE EXCEPTION 'food_drink floor expected 999 after migration, got %', v_floor;
  END IF;
END $$;

COMMIT;
