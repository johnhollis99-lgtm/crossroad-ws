-- =====================================================================
-- 20260518000002_category_significance_floors_seed_b1.sql
--
-- WHAT
--   Seeds the `category_significance_floors` table with the B1 values
--   from the soul-doctrine misalignment fix per
--   `docs/decisions/2026-05-15-top-tier-poi-first-run.md` §Curator decision:
--
--     geology -> 60   (global default 70 was hiding legitimate California
--                      peaks like Junipero Serra Peak at 69 and Cerro San
--                      Luis Obispo at 68; corpus is structurally smaller
--                      than history/architecture, justifying a lower floor)
--
--     nature  -> 65   (geography surface; floor between geology and
--                      history. Surfaces high-quality natural features
--                      that the global 70 floor hides without flooding
--                      the surface)
--
--   Other categories remain at the COALESCE-derived global default of 70.
--
--   Schema reminder (from 20260514000004):
--     category PRIMARY KEY (text, free-text — not FK to poi_categories)
--     significance_floor (smallint, CHECK 0–100)
--     notes (text)
--     updated_at (auto-touched by public.set_updated_at trigger)
--
--   ON CONFLICT (category) DO UPDATE so this migration is idempotent
--   if re-run, and so the (low-volume, curator-tuned) floor values can
--   be evolved via subsequent migrations without manual TRUNCATE.
--
-- WHY
--   Per Track 2 soul-doctrine misalignment diagnostic
--   (`docs/poi-soul-doctrine-diagnostic-2026-05-18.md`):
--   - Geology layer: median source_base 8, max 60 (Mt. Whitney editorial).
--     58 live POIs; mostly caves. Legitimate peaks like Junipero Serra
--     Peak (69), Cerro San Luis Obispo (68), Cone Peak (68) live just
--     under the global 70 floor.
--   - Geography (nature) layer: median source_base 10, max 52. 11,982
--     live POIs but only 15 at >= 70.
--
--   This migration is a TRIGGER-POLICY change. It does NOT touch any
--   significance_score values. The lookahead query reads
--     COALESCE(csf.significance_floor, 70)
--   which now returns 60 for geology and 65 for nature instead of the
--   bare global default.
--
-- BLAST RADIUS
--   - 0 score recomputes (the score is untouched).
--   - Trigger eligibility expands: any POI with score in
--     [60..69] in geology, or [65..69] in nature, now eligible.
--   - Estimated newly-eligible POIs (live, by category, from
--     poi-soul-doctrine-diagnostic-2026-05-18.md §2):
--       * geology: ~5 rows in 60..69 (top 7 below previous floor)
--       * nature: ~15 rows in 65..69 (top of below-70 cluster)
--
-- REVERSIBILITY
--   Trivial:
--     UPDATE category_significance_floors SET significance_floor = 70
--      WHERE category IN ('geology','nature');
--   Or TRUNCATE the table entirely to restore global-70 behavior across
--   all categories.
--
-- APPLY
--   Applied via direct pg connection on 2026-05-18 per
--   docs/decisions/2026-05-15-top-tier-poi-first-run.md §Curator decision.
-- =====================================================================

BEGIN;

INSERT INTO public.category_significance_floors (category, significance_floor, notes)
VALUES
  ('geology', 60,
    'B1 soul-doctrine misalignment fix per docs/decisions/2026-05-15-top-tier-poi-first-run.md. ' ||
    'Geology corpus has only 58 live POIs (vs. 11,982 nature / 3,543 history) with ' ||
    'median source_base 8. Lower floor surfaces Junipero Serra Peak (69), Cerro San ' ||
    'Luis Obispo (68), Cone Peak (68), and other legitimate California peaks the ' ||
    'global 70 floor hides.'),
  ('nature',  65,
    'B1 soul-doctrine misalignment fix per docs/decisions/2026-05-15-top-tier-poi-first-run.md. ' ||
    'Geography surface; 11,982 live POIs but only 15 at >= 70 with median source_base ' ||
    '10. Floor at 65 surfaces top California peaks/features without flooding the surface.')
ON CONFLICT (category) DO UPDATE
  SET significance_floor = EXCLUDED.significance_floor,
      notes              = EXCLUDED.notes;
-- updated_at auto-touched by public.set_updated_at trigger on UPDATE.

COMMIT;

-- ---------------------------------------------------------------------
-- Verification (run separately after COMMIT):
--
--   SELECT category, significance_floor, notes
--     FROM public.category_significance_floors
--    ORDER BY category;
--   -- Expect 2 rows: geology=60, nature=65.
--
--   -- Effective floor for any category (lookahead query pattern):
--   SELECT pc.slug,
--          COALESCE(csf.significance_floor, 70) AS effective_floor
--     FROM public.poi_categories pc
--     LEFT JOIN public.category_significance_floors csf ON csf.category = pc.slug
--    ORDER BY pc.slug;
--   -- Expect: geology=60, nature=65, all others=70.
-- ---------------------------------------------------------------------
