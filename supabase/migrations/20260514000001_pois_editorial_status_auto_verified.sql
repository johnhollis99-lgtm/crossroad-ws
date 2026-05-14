-- =====================================================================
-- 20260514000001_pois_editorial_status_auto_verified.sql
--
-- WHAT
--   Adds a fifth editorial_status value `auto_verified` and backfills it
--   onto every active draft POI that satisfies the rule-based promotion
--   gate. The new value sits alongside `verified` (kept reserved for
--   human-reviewed rows) so the audit trail between rule-promoted vs.
--   human-curated POIs stays intact.
--
--   Two-step transaction:
--     1. UPDATE pois SET editorial_status = 'auto_verified' (+ updated_at)
--        WHERE editorial_status = 'draft'
--          AND (source_type IN ('nrhp','state_landmark','editorial')
--               OR significance_score >= 50)
--     2. ADD CONSTRAINT pois_editorial_status_check
--          CHECK (editorial_status IN
--                 ('draft','needs_geocoding','verified',
--                  'reviewed','auto_verified'))
--        (idempotent via pg_constraint lookup — skipped if it already exists)
--
--   `needs_geocoding` rows are NOT promoted (the WHERE pins draft).
--   `verified` (31) and `reviewed` (12) rows are NOT touched.
--   The CHECK lands AFTER the UPDATE so every existing row already
--   satisfies the locked vocabulary by the time the constraint validates.
--
--   Live audit (2026-05-14, pre-apply):
--     editorial_status
--       draft            21,779
--       needs_geocoding   2,100
--       verified             31
--       reviewed             12
--
--   Promotion rule row count: 3,271
--     by_source             2,122  (nrhp / state_landmark / editorial)
--     by_significance_only  1,149  (significance_score >= 50, other sources)
--
--   Expected post-apply distribution:
--     draft            18,508  (21,779 - 3,271)
--     auto_verified     3,271
--     needs_geocoding   2,100
--     verified             31
--     reviewed             12
--
-- APPLIED
--   Applied via Supabase Studio web UI on YYYY-MM-DD — fill in after manual apply
-- =====================================================================

BEGIN;

-- 1. Promote draft → auto_verified for the rule-eligible set.
--    Idempotent: re-running matches zero rows because the WHERE clause
--    requires editorial_status = 'draft', and promoted rows are no longer
--    drafts.
UPDATE public.pois
   SET editorial_status = 'auto_verified',
       updated_at       = NOW()
 WHERE editorial_status = 'draft'
   AND (source_type IN ('nrhp', 'state_landmark', 'editorial')
        OR significance_score >= 50);

-- 2. Lock the editorial_status vocabulary to the 5-value set.
--    Idempotent: skipped if pois_editorial_status_check already exists.
--    Bare ADD CONSTRAINT (no IF NOT EXISTS — PG doesn't support that on
--    CHECK constraints), guarded by a pg_constraint lookup.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.pois'::regclass
       AND conname  = 'pois_editorial_status_check'
  ) THEN
    ALTER TABLE public.pois
      ADD CONSTRAINT pois_editorial_status_check
      CHECK (editorial_status IN (
        'draft',
        'needs_geocoding',
        'verified',
        'reviewed',
        'auto_verified'
      ));
  END IF;
END $$;

COMMIT;

-- ---------------------------------------------------------------------
-- Verification (run separately after COMMIT):
--
--   SELECT editorial_status, COUNT(*) AS n
--     FROM public.pois
--    GROUP BY editorial_status
--    ORDER BY n DESC;
--   -- Expect: draft 18,508 / auto_verified 3,271 / needs_geocoding 2,100
--   --         verified 31 / reviewed 12
--
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'public.pois'::regclass
--      AND conname  = 'pois_editorial_status_check';
--   -- Expect one row:
--   --   pois_editorial_status_check
--   --   CHECK ((editorial_status = ANY (ARRAY['draft'::text,
--   --     'needs_geocoding'::text, 'verified'::text,
--   --     'reviewed'::text, 'auto_verified'::text])))
-- ---------------------------------------------------------------------
