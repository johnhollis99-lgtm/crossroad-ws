-- 20260511000002_corridors_enum_checks.sql
--
-- Resolves drift catalog entry 5.30 (`corridors` free-form enum-like columns).
--
-- Adds CHECK constraints locking the two enum-like text columns on
-- `corridors` to the value spaces actually in use today, plus their
-- schema defaults so a bare `INSERT INTO corridors (name, path)` keeps
-- working.
--
-- Pre-flight (verified 2026-05-11 against staging via direct pg, 6 rows total):
--
--   SELECT region_type, count(*) FROM public.corridors GROUP BY 1;
--   → geological: 2
--   → desert: 1
--   → suburban: 1
--   → alpine: 1
--   → mountain_pass: 1
--   (no rows use the 'rural' schema default — included below for default-compat)
--
--   SELECT editorial_status, count(*) FROM public.corridors GROUP BY 1;
--   → verified: 6
--   (no rows use the 'draft' schema default — included below for default-compat
--    and to mirror the sibling `pois.editorial_status` vocabulary, where the
--    'draft' → 'verified' state machine is load-bearing in RPC filters)
--
--   Neither column has NULLs (both are NOT NULL at the schema level).
--
-- If a new value is needed in the future, extend the relevant CHECK in a
-- follow-up migration. Importers / seed scripts that emit a new value will
-- fail loudly at INSERT time, which is the intended posture per 5.30
-- ("add CHECKs once the value space is known").

BEGIN;

ALTER TABLE public.corridors
  ADD CONSTRAINT corridors_region_type_check
  CHECK (region_type IN ('geological', 'desert', 'suburban', 'alpine', 'mountain_pass', 'rural'));

ALTER TABLE public.corridors
  ADD CONSTRAINT corridors_editorial_status_check
  CHECK (editorial_status IN ('draft', 'verified'));

COMMIT;

-- Verification (re-run post-apply):
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'public.corridors'::regclass
--      AND contype = 'c'
--    ORDER BY conname;
--   → corridors_editorial_status_check
--       CHECK ((editorial_status = ANY (ARRAY['draft'::text, 'verified'::text])))
--   → corridors_region_type_check
--       CHECK ((region_type = ANY (ARRAY['geological'::text, 'desert'::text,
--                                        'suburban'::text, 'alpine'::text,
--                                        'mountain_pass'::text, 'rural'::text])))
