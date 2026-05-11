# Decision needed — `public.routes` pre-auth NULL `user_id` rows

**Status:** Blocking the routes RLS hotfix. No migration has been written or applied — see `docs/audit-routes-rls.md` for the full Step-1/Step-2 evidence.

---

## What was found

All 5 rows in `public.routes` have `user_id = NULL`. They were inserted on
2026-05-03 (the second day of project work, before authentication was wired
up). One row has `destination = ''`. The other four all have
`destination = 'south lake tahoe'` — the dev's repeated test query.

`auth.users` is also empty (0 rows). There are no real users yet, so no
backfill mapping is even possible.

| id (truncated) | user_id | destination       | created_at         |
|----------------|---------|-------------------|--------------------|
| `f2ba1256…`    | null    | `''` (empty)      | 2026-05-03 06:52   |
| `f71c8b71…`    | null    | south lake tahoe  | 2026-05-03 07:07   |
| `347fa2a0…`    | null    | south lake tahoe  | 2026-05-03 07:23   |
| `a3ba0e67…`    | null    | south lake tahoe  | 2026-05-03 09:13   |
| `1b6f40e7…`    | null    | south lake tahoe  | 2026-05-03 09:20   |

The hotfix migration spec in the prompt requires:

1. `ALTER COLUMN user_id TYPE uuid USING user_id::uuid` — this works on NULL
   (returns NULL) so it would not fail.
2. `ALTER COLUMN user_id SET NOT NULL` — **this fails** for any NULL row.
3. `ADD CONSTRAINT routes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` — this would succeed only if every non-NULL value matches a row in `auth.users`. With `auth.users` empty, no backfill value would survive.

So the rows have to leave the table (or the migration spec has to bend) before the hotfix can land.

---

## Options

### Option A (recommended) — DELETE the 5 rows

```sql
DELETE FROM public.routes;  -- truncates to 0 rows; no FK in/out today
```

**Why this is the right call:**

- Zero ambiguity about ownership: there are no users yet, so the rows have no owner who could ever reclaim them.
- They are obvious test data: identical destination string repeated, all created in a 2.5-hour dev session, one is empty-string garbage.
- Storing them anonymously *was* the bug — there was never an intent for `routes` to hold un-owned rows long-term, and the fix is making `user_id` mandatory.
- No external system references them (no FK pointing in, no joins relying on these IDs).

This unblocks the hotfix migration with no schema concession.

### Option B — Make `user_id` nullable in the new schema

Drop the `SET NOT NULL` step. FK still applies (FKs allow NULL by default unless the column is NOT NULL).

**Why this is worse:**

- Anonymous rows in a "saved trips" table is a security/privacy footgun: no RLS predicate can scope them ("owned by NULL" leaks nothing useful, but every authenticated SELECT would have to filter `user_id = auth.uid() AND user_id IS NOT NULL` to avoid showing strangers' anon rows).
- It bakes a workaround for 5 bad rows into the schema forever.
- Doesn't address the underlying fact that these rows are test garbage, not real saved trips.

### Option C — Backfill with a sentinel uuid

Create a synthetic "system" user in `auth.users`, point all 5 rows at that uuid, then proceed with the hotfix.

**Why this is worse:**

- `auth.users` is managed by Supabase Auth; manually inserting rows there is
  fragile and out-of-band.
- Semantically wrong — these aren't system-owned, they're just orphaned test
  inserts.
- Adds permanent garbage to a table that's currently clean (0 real users).

---

## Recommendation

**Option A.** One `DELETE FROM public.routes;` and the migration proceeds cleanly. If you confirm, I'll add the DELETE as the first statement of the hotfix migration itself (so the cleanup and the schema change ship as one atomic transaction) and continue with Steps 3–6.

If you prefer to wipe the rows out-of-band first and have the migration itself stay schema-only, that's also fine — say so and I'll write it that way.

---

## What I need from you

One of:

- ✅ **"Go with Option A — include the DELETE in the migration"** → I'll write `<ts>_routes_rls_hotfix.sql` with `DELETE FROM public.routes;` as the first body statement, then the rest per spec.
- ✅ **"Go with Option A — I'll wipe the rows manually first, then run the migration"** → I'll wait for you to confirm the rows are gone, then write the schema-only migration.
- ✅ **"Go with Option B"** → I'll write the migration with `user_id` left nullable. I will push back once on this in writing before doing it.
- ✅ **"Go with Option C"** → I'll need the sentinel uuid you want to use; I won't fabricate one.
- ✏️ **Something else** → tell me.
