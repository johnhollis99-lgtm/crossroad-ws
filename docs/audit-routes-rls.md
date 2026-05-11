# Audit — `public.routes` RLS hotfix (drift catalog 5.20 + 5.21)

**Date:** 2026-05-10
**Status:** **STOPPED at Step 2 decision gate.** Migration not written; not applied. See `docs/decision-needed-routes-orphans.md` for the human choice required before proceeding.

---

## Step 1 — Investigation (read-only)

Queries run against the live DB via `pg` (DATABASE_URL).

### Q1 — RLS enabled?
| schemaname | tablename | rowsecurity |
|------------|-----------|-------------|
| public     | routes    | **true**    |

RLS is on at the table level. ✓

### Q2 — Existing policies
| policyname         | cmd | qual   | with_check | roles      |
|--------------------|-----|--------|------------|------------|
| `Routes are public`| ALL | `true` | `null`     | `{public}` |

**This is the bug** (drift entry 5.20). One blanket policy on `cmd=ALL`, `qual=true`, applied to the `public` role. RLS is enabled but the policy has no predicate, so the table is effectively wide open to anon and authenticated roles alike — anyone with the anon key can SELECT/INSERT/UPDATE/DELETE every row.

### Q3 — Column types
| # | column          | type                       | nullable | default               |
|---|-----------------|----------------------------|----------|-----------------------|
| 0 | id              | uuid                       | NO       | `gen_random_uuid()`   |
| 1 | **user_id**     | **text**                   | **YES**  | `null`                |
| 2 | destination     | text                       | NO       | `null`                |
| 3 | origin_lat      | double precision           | YES      | `null`                |
| 4 | origin_lng      | double precision           | YES      | `null`                |
| 5 | dest_lat        | double precision           | YES      | `null`                |
| 6 | dest_lng        | double precision           | YES      | `null`                |
| 7 | distance_mi     | double precision           | YES      | `null`                |
| 8 | duration_min    | integer                    | YES      | `null`                |
| 9 | filter_snapshot | jsonb                      | YES      | `'{}'::jsonb`         |
|10 | created_at      | timestamptz                | YES      | `now()`               |

**This is the second bug** (drift entry 5.21). `user_id` is `text` and nullable, with no FK to `auth.users`. The intended hotfix is `text → uuid`, `SET NOT NULL`, and `FK ... ON DELETE CASCADE`.

### Q4 — Existing constraints
| conname       | def                |
|---------------|--------------------|
| routes_pkey   | PRIMARY KEY (id)   |

PK only. No FK on `user_id`. No NOT NULL. No CHECK constraints.

### Q5 — Existing indexes
| indexname             | indexdef                                                                |
|-----------------------|-------------------------------------------------------------------------|
| routes_pkey           | UNIQUE btree (id)                                                       |
| routes_user_idx       | btree (user_id)                                                         |
| routes_created_idx    | btree (created_at DESC)                                                 |

`routes_user_idx` already exists — the type change `text → uuid` will rebuild it automatically; no separate index work needed.

### Q6 — Triggers
None (no `set_updated_at` trigger; table has no `updated_at` column).

### Q7 — Live data (all 5 rows)
| id        | user_id | destination       | created_at              |
|-----------|---------|-------------------|-------------------------|
| f2ba1256… | **null**| `''` (empty)      | 2026-05-03T06:52:07.988Z |
| f71c8b71… | **null**| south lake tahoe  | 2026-05-03T07:07:22.182Z |
| 347fa2a0… | **null**| south lake tahoe  | 2026-05-03T07:23:04.757Z |
| a3ba0e67… | **null**| south lake tahoe  | 2026-05-03T09:13:04.162Z |
| 1b6f40e7… | **null**| south lake tahoe  | 2026-05-03T09:20:27.552Z |

**Every row's `user_id` is NULL.** All five were inserted on 2026-05-03 (six days into the project, before auth was wired up). One row even has `destination = ''`. These are clearly anonymous dev-time test rows.

---

## Step 2 — Coercion safety + decision gate

### Q8 — Castability of `user_id`
| id        | user_id | verdict        |
|-----------|---------|----------------|
| f2ba1256… | null    | **NOT_CASTABLE** |
| f71c8b71… | null    | **NOT_CASTABLE** |
| 347fa2a0… | null    | **NOT_CASTABLE** |
| a3ba0e67… | null    | **NOT_CASTABLE** |
| 1b6f40e7… | null    | **NOT_CASTABLE** |

Note: NULL technically *casts* fine (`NULL::uuid` is NULL). The regex returns NULL on NULL input, which falls through to the ELSE branch — that's why the verdict is NOT_CASTABLE. Either way these rows cannot satisfy the migration's `SET NOT NULL` + `FK auth.users(id)` requirements.

### Q9 — Orphan check
| id | user_id | verdict |
|----|---------|---------|
| _(zero rows — the WHERE filter excludes NULLs)_ | | |

No rows enter the orphan check because none have a uuid-shaped `user_id` to look up.

### Q10 — Sanity: `auth.users` count
| count |
|-------|
| **0** |

Zero registered users. No `user_id` value would survive a `FK auth.users(id)` constraint today even if we backfilled with synthetic uuids.

### Decision gate

Per the prompt:

> Any NOT_CASTABLE → STOP. Write `docs/decision-needed-routes-orphans.md` describing the bad rows.

**STOPPED.** All five rows fail the cast/NOT NULL test and there are no users to FK them to. No migration written, none applied. See `docs/decision-needed-routes-orphans.md` for the human options.

---

## Steps 3–4 (resolved 2026-05-10 in follow-up session)

### Step 1 reconciliation — case (c)

`ls -la supabase/migrations/ | grep -i routes` matched only the unrelated
`20260510000007_rls_hotfix_highway_routes.sql` (the highway_routes migration
from the RLS-drift sweep). No prior `_routes_rls_hotfix.sql` existed —
**case (c)**, fresh-write per the simplified Step-2 shape.

Pre-apply re-check confirmed safe to proceed without a DELETE block:
- `public.routes`: 0 rows (5 NULL rows had been deleted out-of-band)
- `auth.users`: 0 rows
- `routes.user_id`: still `text` / `YES`
- Existing policy: still `'Routes are public'` (ALL/true/{public})
- Constraints: PK only

### Step 3 — migration applied

File: [supabase/migrations/20260510000008_routes_rls_hotfix.sql](../supabase/migrations/20260510000008_routes_rls_hotfix.sql)

Apply output (verbatim, via direct `pg` client — no supabase CLI on PATH;
project's standard pattern matches):

```
APPLY: e:/Dev XRoad/roadstory/supabase/migrations/20260510000008_routes_rls_hotfix.sql
OK (154ms, 11 statement results)
  [0]  BEGIN  rowCount=0
  [1]  DROP   rowCount=0     -- DROP POLICY "Routes are public"
  [2]  ALTER  rowCount=0     -- ALTER COLUMN user_id TYPE uuid
  [3]  ALTER  rowCount=0     -- ALTER COLUMN user_id SET NOT NULL
  [4]  ALTER  rowCount=0     -- ADD CONSTRAINT routes_user_id_fkey
  [5]  ALTER  rowCount=0     -- ENABLE ROW LEVEL SECURITY
  [6]  CREATE rowCount=0     -- CREATE POLICY routes_select_own
  [7]  CREATE rowCount=0     -- CREATE POLICY routes_insert_own
  [8]  CREATE rowCount=0     -- CREATE POLICY routes_update_own
  [9]  CREATE rowCount=0     -- CREATE POLICY routes_delete_own
  [10] COMMIT rowCount=0
```

The companion highway_routes migration (`20260510000007_rls_hotfix_highway_routes.sql`,
written and staged in the prior session) was applied immediately after:

```
APPLY: e:/Dev XRoad/roadstory/supabase/migrations/20260510000007_rls_hotfix_highway_routes.sql
OK (82ms, 5 statement results)
  [0] BEGIN  rowCount=0
  [1] ALTER  rowCount=0      -- ENABLE ROW LEVEL SECURITY
  [2] DROP   rowCount=0      -- DROP POLICY IF EXISTS (no-op)
  [3] CREATE rowCount=0      -- CREATE POLICY "Public read highway_routes"
  [4] COMMIT rowCount=0
```

### Step 4 — verification (all 5 checks PASSED)

**Check A — routes policies (4 expected, all `auth.uid()` referencing):**

| policyname        | cmd    | qual                     | with_check               | roles      |
|-------------------|--------|--------------------------|--------------------------|------------|
| routes_delete_own | DELETE | `(user_id = auth.uid())` | null                     | `{public}` |
| routes_insert_own | INSERT | null                     | `(user_id = auth.uid())` | `{public}` |
| routes_select_own | SELECT | `(user_id = auth.uid())` | null                     | `{public}` |
| routes_update_own | UPDATE | `(user_id = auth.uid())` | `(user_id = auth.uid())` | `{public}` |

`'Routes are public'` is gone. Four policies, one per command, all gated by `auth.uid()`. Roles=`{public}` is correct here (the predicate does the filtering, not the role).

**Check B — `routes.user_id` type:**

| column_name | data_type | is_nullable |
|-------------|-----------|-------------|
| user_id     | uuid      | NO          |

**Check C — FK to `auth.users`:**

| conname               | def                                                                |
|-----------------------|--------------------------------------------------------------------|
| routes_user_id_fkey   | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`|

**Check D — RLS enabled on routes:**

| rowsecurity |
|-------------|
| true        |

**Check E — highway_routes (RLS + policy):**

| rowsecurity |
|-------------|
| true        |

| policyname                   | cmd    | qual   | roles      |
|------------------------------|--------|--------|------------|
| Public read highway_routes   | SELECT | `true` | `{public}` |

Sanity check on row counts (no data movement):

| table          | rows |
|----------------|------|
| routes         | 0    |
| highway_routes | 221  |

**VERIFIED LIVE: routes user-own RLS + user_id uuid + FK to auth.users + highway_routes public-read RLS — 2026-05-10**

### Step 5 — drift catalog amendment

Created [docs/drift-catalog.md](drift-catalog.md) and seeded with entries 5.16, 5.19, 5.19a (correction), 5.20 (resolved), 5.21 (resolved). The catalog file did not previously exist — see the §0 note in that file for the genesis explanation.

### Step 6 — code-read for breakage

Deferred — the prompt scope for this hotfix session focused on schema + verification, and did not request the code-read pass. Carrying it as a follow-up: ripgrep `from('routes')` and the TypeScript `Route` interface, classify each call site as "passes uuid string fine" / "MUST FIX" / "SHOULD UPDATE TS type". Probably zero MUST FIX (no users are saving trips yet), but worth confirming before the first user signup so the schema change doesn't blow up at runtime under a stale TS shape.
