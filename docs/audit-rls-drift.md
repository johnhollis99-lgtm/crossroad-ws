# RLS drift triage — `public` schema

**Date:** 2026-05-10
**Scope:** every table in `public`. Auth schema, Storage bucket policies, and PostGIS internals (`spatial_ref_sys`) excluded per prompt.
**Outcome:** 2 P0, 1 P1, 0 P2, 5 P3. One P0 fixed via staged migration. The other P0 (`routes`) is **NOT** fixed — see URGENT below.

---

## ⚠️ URGENT

### `public.routes` — wide-open ALL/true policy is still live

The previous session's prompt described the routes RLS hotfix as "just landed". **The live database disagrees.** Verified on 2026-05-10:

```sql
SELECT policyname, cmd, qual, roles FROM pg_policies WHERE tablename='routes';
-- → 'Routes are public' | ALL | true | {public}     ← STILL LIVE
SELECT column_name, data_type, is_nullable FROM information_schema.columns
 WHERE table_name='routes' AND column_name='user_id';
-- → user_id | text | YES                            ← STILL TEXT/NULLABLE
SELECT conname FROM pg_constraint WHERE conrelid='public.routes'::regclass;
-- → routes_pkey  (no FK to auth.users)              ← STILL UNSCOPED
```

What *did* land out-of-band: the 5 NULL-`user_id` rows from the prior session were deleted (live count = 0). Schema and policies are unchanged.

The hotfix migration was never written (the prior session correctly stopped at the decision gate over those 5 rows — see [docs/decision-needed-routes-orphans.md](docs/decision-needed-routes-orphans.md)). With the table now empty, Option A is unblocked: write a schema-only `<ts>_routes_rls_hotfix.sql` mirroring the `user_preferences` pattern.

**This session does NOT write that migration** — the prompt explicitly says "do NOT write a new migration for it". Surfacing here so the next operator picks it up immediately.

**Why this is URGENT despite 0 live rows:** the policy permits arbitrary anon writes today. The moment the first authenticated user saves a trip via the unfixed schema, that row is publicly readable, mutable, and deletable by anyone with the anon key. Saved trip destinations are mild PII (places someone wants to drive). Land the routes hotfix before the first user signs up.

---

## Step 1 — Inventory (live state, 2026-05-10)

### Q1 — RLS state per public table

20 base tables (excluding views). All but `highway_routes` and `spatial_ref_sys` have `rowsecurity=true`. None have `forcerowsecurity=true`.

| table                         | RLS | force | est. rows |
|-------------------------------|-----|-------|-----------|
| badge_definitions             | on  | off   | 17        |
| contribution_rewards          | on  | off   | 0         |
| corridors                     | on  | off   | 6         |
| **highway_routes**            | **off** | off | **221** |
| llm_calls                     | on  | off   | 173       |
| narration_audio               | on  | off   | 37        |
| narrative_documents           | on  | off   | 0         |
| narrators                     | on  | off   | 4         |
| poi_categories                | on  | off   | 20        |
| poi_review_queue              | on  | off   | 0         |
| pois                          | on  | off   | 23,922    |
| **routes**                    | on  | off   | 0         |
| spatial_ref_sys               | off | off   | 8,500     |
| trips                         | on  | off   | 32        |
| user_badges                   | on  | off   | 0         |
| user_contributions            | on  | off   | 0         |
| user_narrators                | on  | off   | 0         |
| user_preferences              | on  | off   | 0         |
| venue_classification_review   | on  | off   | 10        |
| voice_configs                 | on  | off   | 1         |

### Q2 — All policies in `public`

25 policies in total. Reproduced verbatim from `pg_policies`:

| table                  | policy                              | cmd    | qual                                           | with_check                            | roles  |
|------------------------|-------------------------------------|--------|------------------------------------------------|---------------------------------------|--------|
| badge_definitions      | Public read badge_definitions       | SELECT | `true`                                         | —                                     | public |
| contribution_rewards   | cr_user_own                         | ALL    | `auth.uid() = user_id`                         | —                                     | public |
| corridors              | Public read corridors               | SELECT | `true`                                         | —                                     | public |
| llm_calls              | service_role_full_access            | ALL    | `auth.role() = 'service_role'`                 | `auth.role() = 'service_role'`        | public |
| narration_audio        | na_private_read                     | SELECT | `is_shared_cache = false AND auth.uid() = user_id` | —                                 | public |
| narration_audio        | na_shared_read                      | SELECT | `is_shared_cache = true`                       | —                                     | public |
| narrative_documents    | anon_select_narrative_documents     | SELECT | `true`                                         | —                                     | anon   |
| narrators              | narrators_public_read               | SELECT | `is_active = true`                             | —                                     | public |
| poi_categories         | Public read poi_categories          | SELECT | `true`                                         | —                                     | public |
| pois                   | Public read pois                    | SELECT | `true`                                         | —                                     | public |
| **routes**             | **Routes are public**               | **ALL**| **`true`**                                     | —                                     | **public** |
| trips                  | trips_anon_insert                   | INSERT | —                                              | `user_id IS NULL`                     | public |
| trips                  | trips_anon_select                   | SELECT | `user_id IS NULL`                              | —                                     | public |
| trips                  | trips_user_own                      | ALL    | `auth.uid() = user_id`                         | —                                     | public |
| user_badges            | ub_user_read                        | SELECT | `auth.uid() = user_id`                         | —                                     | public |
| user_contributions     | uc_user_own                         | ALL    | `auth.uid() = user_id`                         | —                                     | public |
| user_narrators         | user_narrators_select_own           | SELECT | `auth.uid() = user_id`                         | —                                     | public |
| user_narrators         | user_narrators_insert_own           | INSERT | —                                              | `auth.uid() = user_id`                | public |
| user_narrators         | user_narrators_update_own           | UPDATE | `auth.uid() = user_id`                         | —                                     | public |
| user_narrators         | user_narrators_delete_own           | DELETE | `auth.uid() = user_id`                         | —                                     | public |
| user_preferences       | user reads own preferences          | SELECT | `auth.uid() = user_id`                         | —                                     | public |
| user_preferences       | user updates own preferences        | UPDATE | `auth.uid() = user_id`                         | `auth.uid() = user_id`                | public |
| user_preferences       | user upserts own preferences        | INSERT | —                                              | `auth.uid() = user_id`                | public |
| voice_configs          | anon_select_active_voice_configs    | SELECT | `is_active = true`                             | —                                     | anon   |
| voice_configs          | service_role_full_access            | ALL    | `auth.role() = 'service_role'`                 | `auth.role() = 'service_role'`        | public |

### Tables with RLS enabled but ZERO policies

- `poi_review_queue`
- `venue_classification_review`

With RLS on and no policy, Postgres deny-alls non-table-owner roles. Both are admin queues read/written via `service_role` (which bypasses RLS), so the tables are *functionally* locked down. But the missing policies are convention drift — see P3 below.

---

## Step 2 — Category assignment

Categories are A=user-scoped, B=public-read/admin-write catalog, C=internal/admin only, D=retired/dead, E=unclassified.

| table                         | category | reasoning |
|-------------------------------|----------|-----------|
| badge_definitions             | B        | reward catalog; public SELECT, no public mutation |
| contribution_rewards          | A        | `user_id` uuid NOT NULL; `cr_user_own` policy already in place |
| corridors                     | B        | precomputed scenic corridors, public read |
| highway_routes                | B        | 221 rows of CA highway geometries for adjacency scoring; no PII |
| llm_calls                     | C        | LLM/TTS spend audit; service_role only |
| narration_audio               | B (with A annex) | Mostly public/shared cache; `na_private_read` allows user-owned private rows when `is_shared_cache=false`. Mixed model. |
| narrative_documents           | B        | source corpora; anon SELECT for FTS / admin app |
| narrators                     | B (catalog) | 4 preset rows; not retired despite drift entry 5.19 (see Step 6) |
| poi_categories                | B        | category taxonomy |
| poi_review_queue              | C        | LLM-extracted candidates; admin-only write via service_role |
| pois                          | B        | the canonical POI table |
| routes                        | A        | "saved trips" for authenticated users |
| spatial_ref_sys               | exempt   | PostGIS metadata; managed by extension, RLS off intentional |
| trips                         | A (with anon insert annex) | `user_id` uuid; `trips_user_own` for authenticated; pre-auth fallback policies allow anon NULL-user trip creation |
| user_badges                   | A        | server-awarded badges; SELECT-only public policy, writes via service_role |
| user_contributions            | A        | user-submitted POI suggestions |
| user_narrators                | A        | user-created narrators |
| user_preferences              | A        | per-user settings (canonical pattern reference) |
| venue_classification_review   | C        | venue candidates pending polygon; admin-only |
| voice_configs                 | B        | active voice rows; anon SELECT for `is_active=true`, service_role for everything else |

No D (retired) tables in active use — see Step 6 for the `narrators` / `user_narrators` clarification on drift entry 5.19.
No E (genuinely unclassified) — every table maps cleanly.

---

## Step 3 — Risk classification

### P0 — Anonymous mutation possible

| table          | finding                                                                 | est. rows | impact |
|----------------|-------------------------------------------------------------------------|-----------|--------|
| **routes**     | Policy `Routes are public` is `cmd=ALL, qual=true, roles={public}`. Any anon caller can SELECT/INSERT/UPDATE/DELETE. Schema also unfixed (`user_id` text/nullable, no FK). | 0 | Mild PII (saved trip destinations) once users start signing up. **Fix not written here per prompt instructions** — see URGENT. |
| **highway_routes** | `rowsecurity=false`, no policies. Anon can SELECT/INSERT/UPDATE/DELETE all 221 rows. | 221 | Corruption would silently degrade route adjacency scoring in `recompute-significance.ts`. Not PII. |

### P1 — Anonymous read of sensitive data (or unbounded anon writes that aren't impersonation)

| table   | finding | est. rows | impact |
|---------|---------|-----------|--------|
| trips   | `trips_anon_select` lets anon read every row where `user_id IS NULL`. `trips_anon_insert` lets anon insert with `WITH CHECK (user_id IS NULL)`. **Documented as deliberate** in the migration ("app has no auth yet"); listed as P1 because once auth ships these become a leak / spam vector. | 32 (mix of anon NULL and authenticated rows) | Mild — anon rows are visible to other anon callers; spam insertion is unbounded but not impersonation. |

### P2 — Cat A/C with RLS enabled but no policies (silent deny)

None. Every Cat A table has user-own policies. The two zero-policy tables (`poi_review_queue`, `venue_classification_review`) are Cat C, written by service_role only — silent deny is the *intended* posture, not an oversight. Listed as P3 below for the missing explicit service_role policy.

### P3 — Convention drift (functional, but inconsistent with the user_preferences/routes pattern)

| table                       | drift                                                                                              |
|-----------------------------|----------------------------------------------------------------------------------------------------|
| contribution_rewards        | Single `cmd=ALL` policy instead of the four-separate-policies shape used by `user_preferences` and `user_narrators`. Functionally equivalent (ALL covers SELECT/INSERT/UPDATE/DELETE) but harder to audit per-command. |
| user_contributions          | Same as above (single ALL policy).                                                                 |
| user_badges                 | Only a SELECT policy. Writes happen via service_role and are intentionally locked down for end users. Worth a comment in a future migration explaining "no public INSERT policy is intentional — badges are server-awarded." |
| poi_review_queue            | RLS on, zero policies. Functionally deny-all to non-service-role; could add an explicit `service_role_full_access` policy mirroring `llm_calls` for consistency. |
| venue_classification_review | Same as poi_review_queue.                                                                          |

### SAFE — Matches the expected pattern for its category

`badge_definitions`, `corridors`, `llm_calls`, `narration_audio`, `narrative_documents`, `narrators`, `poi_categories`, `pois`, `user_narrators`, `user_preferences`, `voice_configs`. Plus `spatial_ref_sys` (exempt — PostGIS-owned).

---

## Step 4 — Staged hotfix migrations

### `supabase/migrations/20260510000007_rls_hotfix_highway_routes.sql` (P0 / `highway_routes`)

Enables RLS, adds `Public read highway_routes` (SELECT/USING true). No public INSERT/UPDATE/DELETE policy → only `service_role` can write, mirroring `pois`/`poi_categories`/`corridors`. Existing `seed-highway-routes.ts` already uses `SUPABASE_SERVICE_ROLE_KEY`, so no code change is needed.

**Staged, not applied** — per prompt scope.

### `supabase/migrations/<ts>_rls_hotfix_routes.sql` (P0 / `routes`)

**NOT WRITTEN** in this session. Prompt explicitly: "do NOT write a new migration for [routes]". Listed in URGENT above. Live data is now 0 rows so Option A from `docs/decision-needed-routes-orphans.md` (schema-only migration, no inline DELETE) is unblocked whenever a session is willing to write it.

---

## Step 5 — P1 / P2 / P3 follow-up

### P1 — `trips` anon policies

The two policies (`trips_anon_select`, `trips_anon_insert`) were added deliberately in `20260504000001_trips_table.sql` and `20260504000004_trips_anon_select.sql` as a pre-auth bridge ("app has no auth yet — user_id will be null"). They allow:

- Any anon caller to read every other anon caller's NULL-user_id trips, including destination strings and lat/lon.
- Any anon caller to insert unbounded NULL-user_id rows (no rate-limit, no captcha).

**Proposed fix shape for the post-auth follow-up:**

```sql
DROP POLICY trips_anon_select ON public.trips;
DROP POLICY trips_anon_insert ON public.trips;
```

Once auth signups are enabled, the anon flow should either disappear (force users to sign up before saving a trip) or move to a session-token model where the anon row is keyed to the device's session and that's the predicate. The current "any anon reads any anon row" shape is not durable.

**Queued. Not blocking.** No code currently relies on cross-anon reads (each anon client only reads back its own RETURNING insert, per the migration comment).

### P2 — none

### P3 — convention-drift batch (one migration when convenient)

Group these into a single tier-two cleanup migration:

1. Replace `cr_user_own` (single ALL) on `contribution_rewards` with four separate SELECT/INSERT/UPDATE/DELETE policies matching the `user_preferences` shape. Keep `(auth.uid() = user_id)` predicate.
2. Same for `uc_user_own` on `user_contributions`.
3. Add an explicit `service_role_full_access` policy on `poi_review_queue` and `venue_classification_review` (mirroring `llm_calls`). Keeps current behavior; just makes the deny-all-to-non-service-role posture explicit in `pg_policies`.
4. Optional comment-only migration: add a SQL comment on `user_badges` explaining the SELECT-only-by-design intent.

Cosmetic; no behavior change. Saving this for a "RLS convention sweep" PR.

---

## Step 6 — URGENT call-out + Category D

### URGENT (apply today / before first user signup)

- **`routes`** — see top of report. NOT fixed in this session; prompt forbids writing the migration. Next session should land it.

The `highway_routes` P0 is staged but not URGENT — no PII, no auth tokens, only catalog corruption risk. Apply with the next routine RLS migration batch.

### Category D — drop candidates

**None.** Drift entry 5.19 ([CLAUDE.md migration backlog](CLAUDE.md)) lists `narrators` and `user_narrators` as candidates for retirement. Live state contradicts that:

- `narrators` has 4 preset rows actively used as fallback in [app/customize.tsx:78-138](app/customize.tsx#L78-L138) and via the `narrators_public_read` policy. Active.
- `user_narrators` has 0 rows but the table is referenced by `trips.user_narrator_id` FK and has full SELECT/INSERT/UPDATE/DELETE policies for the user-narrator UI feature. Planned, not retired.

Recommendation: revisit drift entry 5.19, but don't drop either table. If the rename `narrator_slug → voice_id` ever happens, that touches `narrators` and `user_narrators` columns; the tables themselves stay.

---

## Notes on what was NOT scanned (per prompt)

- **Supabase Storage bucket policies.** `narration_audio` bucket is public (created by migration 20260504000019). Worth a separate pass — does the storage.objects RLS allow arbitrary uploads via anon, or does the public bucket only mean public-read? Flag for a future Prompt.
- **Auth schema tables.** Supabase manages these.
- **Policies outside `public`.** Same.

---

## Verification snippet (re-run any time)

Saved as a one-shot script — see `_audit-rls-drift.mjs` (deleted after this run; mjs body is reproduced in the bash command history of the session that produced this doc). Recreate from these queries:

```sql
SELECT n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname;

SELECT tablename, policyname, cmd, qual, with_check, roles
  FROM pg_policies WHERE schemaname='public'
 ORDER BY tablename, policyname;

SELECT relname, n_live_tup
  FROM pg_stat_user_tables WHERE schemaname='public'
 ORDER BY n_live_tup DESC;
```
