-- =====================================================================
-- 20260514000004_category_significance_floors.sql
--
-- WHAT
--   Creates the `category_significance_floors` lookup table per the
--   Narration & Curation Addendum §2.2. Holds per-category minimum
--   `significance_score` values that gate which POIs trigger unsolicited
--   narration in the lookahead worker.
--
--   Default behavior when a category has no row: 70 (the global default
--   from addendum §2.1). The lookahead query reads
--     COALESCE(csf.significance_floor, 70)
--   so empty table = global 70 floor everywhere. Tune per-category as
--   post-import POI distributions accumulate (addendum §2.2; roadmap
--   Phase G2 — the human-curator editorial pass).
--
--   No seed data. The addendum example values (geology 60, nature 65,
--   architecture 80, food 0, etc.) are placeholders, not the canonical
--   set. The human curator sets the actual values in a follow-up
--   migration once the import + significance recompute completes and
--   we can see the real score distribution per category.
--
--   Schema (per addendum §2.2):
--     category          text PRIMARY KEY  -- joins to poi_categories.slug
--     significance_floor smallint NOT NULL
--                       CHECK (significance_floor BETWEEN 0 AND 100)
--     notes             text
--     updated_at        timestamptz NOT NULL DEFAULT now()
--
--   `category` is a free-text PK (NOT an FK to poi_categories) to keep
--   floors independent of category-row lifecycle. If a category is
--   renamed in poi_categories, the floor row stays — the curator can
--   update it explicitly. Avoids an FK cascade that would silently
--   discard tuning work on a rename.
--
--   updated_at uses the shared `public.set_updated_at()` trigger
--   function captured in migration `20260510000001_user_preferences_capture.sql`
--   (per CLAUDE.md updated_at trigger reuse convention).
--
--   RLS: disabled. This is a config table — readable to anon for the
--   lookahead query path; writes are admin/migration-only via service role.
--
-- APPLIED
--   Applied via direct pg connection on 2026-05-14. Verified: table created,
--   set_updated_at trigger present (reusing public.set_updated_at()), RLS
--   enabled with csf_anon_select policy. Empty seed — values to be set by
--   curator post-import distribution review (roadmap Phase G2).
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.category_significance_floors (
  category           text        PRIMARY KEY,
  significance_floor smallint    NOT NULL CHECK (significance_floor BETWEEN 0 AND 100),
  notes              text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Reuse the shared updated_at trigger function. Idempotent via DROP/CREATE.
DROP TRIGGER IF EXISTS set_updated_at ON public.category_significance_floors;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.category_significance_floors
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.category_significance_floors ENABLE ROW LEVEL SECURITY;

-- Anon read policy: lookahead worker (anon key) needs to read floors.
DROP POLICY IF EXISTS csf_anon_select ON public.category_significance_floors;
CREATE POLICY csf_anon_select
  ON public.category_significance_floors
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies — service role bypasses RLS, so the
-- migration tooling and admin app can mutate; nothing else can.

COMMIT;

-- ---------------------------------------------------------------------
-- Verification (run separately after COMMIT):
--
--   SELECT to_regclass('public.category_significance_floors');
--   -- Expect: public.category_significance_floors
--
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.category_significance_floors'::regclass
--      AND tgname = 'set_updated_at';
--   -- Expect one row
--
--   SELECT polname FROM pg_policy
--    WHERE polrelid = 'public.category_significance_floors'::regclass
--    ORDER BY polname;
--   -- Expect: csf_anon_select
-- ---------------------------------------------------------------------
