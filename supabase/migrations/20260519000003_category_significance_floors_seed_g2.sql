-- =====================================================================
-- 20260519000003_category_significance_floors_seed_g2.sql
--
-- WHAT
--   Seeds the per-category significance floors per addendum §2.2 with
--   the G2 curator-tuned values (overwriting the B1 seed at 20260518000002
--   for geology + nature; adding the other 12 rows for the first time).
--
--   Final table state after this migration (17 rows):
--
--     Top-level (11):
--       geology          60   (curator: smaller corpus; surface peaks 60–69)
--       nature           65   (curator: geography surface; surface top features 65–69)
--       history          70   (addendum §2.1 baseline)
--       local_culture    70   (covers music venues + public art + heritage culture)
--       architecture     90   (curator-bumped from addendum §2.2's placeholder 80;
--                              rationale below)
--       art              75   (between local_culture and architecture)
--       food_drink        0   (floor disabled; iconic_local override is the surfacing path)
--       engineering      70   (addendum baseline; bridges/dams/mining subs mirror)
--       viewpoint        65   (scenic viewpoints at slightly reduced floor —
--                              between nature's 65 and history's 70)
--       hidden_gems      70   (COALESCE-default value; row present for explicitness)
--       recreation       70   (COALESCE-default value; row present for explicitness)
--
--     Subs (6) — explicit so sub-slugs follow parent-category semantics
--     rather than the COALESCE-70 fallback:
--       volcanic         60   (geology sub; mirror parent)
--       hot_springs      60   (geology sub; mirror parent)
--       native_history   70   (history sub; mirror parent)
--       bridges          70   (engineering sub; mirror parent)
--       dams             70   (engineering sub; mirror parent)
--       mining           70   (engineering sub; mirror parent)
--
--     Slugs without explicit rows — fall through to COALESCE-70:
--       legends. (Only one live slug not explicitly seeded; future
--       additions can be either added here or left to COALESCE.)
--
-- ARCHITECTURE 90 RATIONALE
--   California has ~1,650 NRHP-listed architecture POIs with scores
--   60–89 — many anonymous 19th-century Methodist churches, mid-century
--   office buildings — that the addendum's 80 floor wouldn't reject.
--   The 90 floor pushes the burden onto editorial_curated for any
--   sub-90 architecture that legitimately deserves narration.
--
-- FOOD_DRINK 0 RATIONALE
--   Per addendum §1.1 the food/drink category is opt-in via Narrative
--   Focus, and §8 specifies the Iconic Local Override as the only
--   surfacing path for food in the default "Land Speaks" mode. Setting
--   floor=0 means the significance-floor filter never excludes food_drink
--   rows on score alone — the editorial_curated / iconic_local bypass in
--   the RPC's WHERE clause does the surfacing. (Without the 0 floor, a
--   COALESCE-70 default would exclude most food rows since import-time
--   significance scoring is hostile to food/drink: no NRHP base, no
--   route-adjacency bonus matters.)
--
-- WHY OVERWRITE THE B1 SEED NOTES
--   The B1 seed at 20260518000002 set geology=60 and nature=65 with notes
--   explaining the soul-doctrine misalignment fix. G2 keeps the same
--   numeric values but reframes them under the per-category-floor
--   policy. The migration history of why we landed at 60 / 65 is
--   preserved in the B1 migration file itself; the table's notes column
--   reflects the CURRENT policy framing, not the diff log.
--
-- BACKWARDS COMPAT
--   Migration 20260518000002 (the B1 seed) already exists in source
--   control with the original notes text. Re-applying B1 against a
--   post-G2 table would overwrite the G2 notes with the B1 framing.
--   Practical risk: zero — migrations apply forward, not in arbitrary
--   replay. Documented here so a future "reset and re-apply all
--   migrations" workflow knows G2 must apply after B1.
--
-- IDEMPOTENT
--   ON CONFLICT (category) DO UPDATE so re-running this migration
--   leaves the table in the same final state. updated_at is auto-touched
--   by the public.set_updated_at trigger on UPDATE.
-- =====================================================================

BEGIN;

INSERT INTO public.category_significance_floors (category, significance_floor, notes) VALUES
  -- ── Top-level (8) ─────────────────────────────────────────────────
  ('geology',       60,
    'G2 — geology corpus is structurally smaller (~58 live POIs vs. 11,982 nature / 3,543 history) ' ||
    'with median source_base 8. Lower floor surfaces legitimate California peaks like ' ||
    'Junipero Serra Peak (69), Cerro San Luis Obispo (68), Cone Peak (68) that the ' ||
    'global 70 floor hides. Subs (volcanic, hot_springs) mirror this floor.'),
  ('nature',        65,
    'G2 — geography surface; 11,982 live POIs but only 15 at >= 70 with median source_base ' ||
    '10. Floor at 65 surfaces top California peaks/features (named waterfalls, prominent ' ||
    'summits) without flooding the surface set with low-significance OSM noise.'),
  ('history',       70,
    'G2 — addendum §2.1 global baseline. Matches COALESCE default; row exists for explicitness ' ||
    'and to anchor the native_history sub-row.'),
  ('local_culture', 70,
    'G2 — addendum baseline. Covers music venues, public art, heritage culture, roadside ' ||
    'oddities. Customize UI''s "Music" / "Roadside" labels both map to this slug.'),
  ('architecture',  90,
    'G2 — California has ~1,650 NRHP-listed architecture POIs with scores 60-89 — many ' ||
    'anonymous 19th-century Methodist churches, mid-century office buildings — that the ' ||
    'addendum''s 80 floor wouldn''t reject. The 90 floor pushes the burden onto ' ||
    'editorial_curated for any sub-90 architecture that legitimately deserves narration. ' ||
    'Curator-tuned override of addendum §2.2''s 80 placeholder.'),
  ('art',           75,
    'G2 — between local_culture (70) and architecture (90). Public sculptures and murals ' ||
    'cluster at significance 60-75; floor at 75 keeps the surface set focused on widely-' ||
    'recognized works without dropping mid-tier legitimately-significant pieces.'),
  ('food_drink',     0,
    'G2 — floor disabled. Per addendum §1.1 food/drink is opt-in via Narrative Focus, and ' ||
    'per addendum §8 the Iconic Local Override is the only surfacing path in the default ' ||
    '"Land Speaks" mode. With floor=0 the significance-floor filter never excludes food_drink ' ||
    'rows on score alone — the editorial_curated / iconic_local bypass in the RPC WHERE ' ||
    'clause does the surfacing. (A COALESCE-70 default would exclude most food rows since ' ||
    'import-time significance scoring is hostile to food/drink.)'),
  ('engineering',   70,
    'G2 — addendum baseline. Bridges, dams, mining subs mirror this floor for explicitness.'),
  ('viewpoint',     65,
    'G2 — scenic viewpoints at slightly reduced floor (between nature''s 65 and history''s 70). ' ||
    'Captures named overlooks and prominent scenic stops that the global 70 floor hides.'),
  ('hidden_gems',   70,
    'G2 — covered by COALESCE default; row present for explicitness.'),
  ('recreation',    70,
    'G2 — covered by COALESCE default; row present for explicitness.'),

  -- ── Subs (6) — explicit rows so sub-slugs follow parent semantics ───
  ('volcanic',      60, 'G2 — geology sub; mirror parent floor (60).'),
  ('hot_springs',   60, 'G2 — geology sub; mirror parent floor (60).'),
  ('native_history',70, 'G2 — history sub; mirror parent floor (70).'),
  ('bridges',       70, 'G2 — engineering sub; mirror parent floor (70).'),
  ('dams',          70, 'G2 — engineering sub; mirror parent floor (70).'),
  ('mining',        70, 'G2 — engineering sub; mirror parent floor (70).')
ON CONFLICT (category) DO UPDATE
  SET significance_floor = EXCLUDED.significance_floor,
      notes              = EXCLUDED.notes;
-- updated_at auto-touched by public.set_updated_at trigger on UPDATE.

COMMIT;

-- ---------------------------------------------------------------------
-- Verification (run separately after COMMIT — also wired into
-- scripts/poi-import/apply-g2-floors.mjs as verification (a)):
--
--   SELECT category, significance_floor
--     FROM public.category_significance_floors
--    ORDER BY category;
--   -- Expect 17 rows:
--   --   architecture   90
--   --   art            75
--   --   bridges        70
--   --   dams           70
--   --   engineering    70
--   --   food_drink      0
--   --   geology        60
--   --   hidden_gems    70
--   --   history        70
--   --   hot_springs    60
--   --   local_culture  70
--   --   mining         70
--   --   native_history 70
--   --   nature         65
--   --   recreation     70
--   --   viewpoint      65
--   --   volcanic       60
--
--   -- Effective floor for every live category slug:
--   SELECT pc.slug,
--          COALESCE(csf.significance_floor, 70) AS effective_floor
--     FROM public.poi_categories pc
--     LEFT JOIN public.category_significance_floors csf ON csf.category = pc.slug
--    ORDER BY pc.slug;
--   -- Expect 18 rows; legends shows 70 (from COALESCE); everything
--   -- else matches an explicit seed row.
-- ---------------------------------------------------------------------
