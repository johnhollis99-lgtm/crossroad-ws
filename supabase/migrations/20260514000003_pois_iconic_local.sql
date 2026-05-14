-- =====================================================================
-- 20260514000003_pois_iconic_local.sql
--
-- WHAT
--   Adds three columns to `pois` per the Narration & Curation Addendum
--   §8.4. These flag Iconic Local Override POIs — places that punch
--   through Narrative Focus filters because they're genuinely iconic
--   (Schat's Bakkery, Cabazon Dinosaurs, Madonna Inn). The flag is set
--   by `scripts/poi-import/sources/iconic-curation.ts` (roadmap Phase F),
--   which scrapes free-tier curated lists (James Beard, Roadfood,
--   Atlas Obscura, Eater, SCA, HHA) and cross-references against
--   existing POIs.
--
--   Columns:
--     iconic_local         boolean NOT NULL DEFAULT false
--     iconic_local_reasons text[]  NOT NULL DEFAULT '{}'
--                          -- e.g. ['wikipedia_article', 'roadfood_listed',
--                          --       'start_date_1938', 'signature_dish:sheepherder_bread']
--     signature_hook       text                              -- nullable
--                          -- the one-liner: "known for sheepherder bread, a
--                          --                 Basque sourdough"
--
--   No CHECK constraints — the array values and signature_hook strings
--   are free-form. Validation lives in the importer + admin review queue.
--
--   Backfill: defaults populate existing rows automatically. The
--   importer (Phase F2) flips iconic_local=true on the ~150–300 POIs
--   that pass the strict bar (addendum §8.2).
--
--   Index posture: no separate index on iconic_local. Read pattern is
--   `WHERE iconic_local = true` filtered by spatial proximity, which
--   already hits the GIST index on pois.location. The selectivity of
--   `iconic_local = true` is ~1.5% (300/21,922) — too low to justify a
--   dedicated b-tree, too high to justify a partial index. Revisit if
--   the lookahead reports slow Iconic-Local queries.
--
--   Live audit (2026-05-14 pre-apply):
--     pois total active rows  21,922 (where merged_into IS NULL)
--     pois.iconic_local       does not exist
--
-- APPLIED
--   Applied via Supabase Studio web UI on YYYY-MM-DD — fill in after manual apply
-- =====================================================================

BEGIN;

ALTER TABLE public.pois
  ADD COLUMN IF NOT EXISTS iconic_local boolean NOT NULL DEFAULT false;

ALTER TABLE public.pois
  ADD COLUMN IF NOT EXISTS iconic_local_reasons text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.pois
  ADD COLUMN IF NOT EXISTS signature_hook text;

COMMIT;

-- ---------------------------------------------------------------------
-- Verification (run separately after COMMIT):
--
--   SELECT
--     iconic_local,
--     COUNT(*) AS n
--   FROM public.pois
--   GROUP BY iconic_local;
--   -- Expect: false 21,922 / true 0  (importer runs later)
--
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name   = 'pois'
--      AND column_name IN ('iconic_local', 'iconic_local_reasons', 'signature_hook')
--    ORDER BY column_name;
--   -- Expect 3 rows: bool/NO/false, ARRAY/NO/'{}', text/YES/NULL
-- ---------------------------------------------------------------------
