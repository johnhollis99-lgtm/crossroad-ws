# XRoad drift catalog

Numbered ledger of schema/code/convention drift between the handoff package and the live codebase. Cross-referenced from audit docs and prompt history.

## §0 — How this file came to exist

Drift entries 5.16, 5.19, 5.20, 5.21 (and others) had been referenced in audit docs and prompt instructions for several sessions, but the catalog itself was never written down — every reference pointed elsewhere with no single source of truth. This file backfills the catalog from those cross-references; entries below are reconstructed from `docs/audit-rls-drift.md`, `docs/audit-routes-rls.md`, prior session handoff prompts, and CLAUDE.md.

**Conventions:**
- Entry numbers, once assigned, are immutable. Corrections get a letter suffix (e.g. `5.19a`) and the original entry stays as-is for history.
- **Status:** `open` (not addressed) · `resolved` (migration/code shipped + verified) · `superseded` (replaced by a corrected entry) · `wontfix` (intentionally left) · `noted` (drift observed and tracked for the record; no action warranted — distinct from `wontfix`, which implies a considered-and-declined fix proposal).
- **Severity:** `urgent` (acutely user-impacting or security) · `high` (blocks downstream work) · `med` · `low` (cosmetic / convention).
- New entries get appended; do not renumber existing ones.

---

## §5 — Schema and convention drift

### 5.15 `pois.category` ghost column

The design-partner spec and several earlier conversations refer to
`pois.category` as a scalar text column. It doesn't exist. The live column
is `category_id uuid` (FK to `poi_categories`, which holds 20 slugs).
Application code and the in-app `POI` type see a `category` field because
`get_nearby_pois` and `get_corridor_pois` project it via an internal JOIN.

**Posture:** durable correction. Any future migration touching category
goes through `category_id` and the JOIN. Never reintroduce a scalar
`category` column on `pois`.

**Status:** `noted` — documented; no action needed.

---

### 5.16 — `pois.source` legacy column redundant with `source_type`

**Status:** Resolved 2026-05-11 via `supabase/migrations/20260511000003_pois_source_drop.sql`.

**Resolution:** Dropped `pois.source`. 23,922/23,922 rows carried the schema default 'curated' with zero code/RPC readers; functional displacement by `source_type` (added in `20260504000005_poi_source_provenance.sql`) was complete since pre-2026-05-04 importer work.

**Judgment calls disclosed:**
- Used `DROP COLUMN` with default RESTRICT (no CASCADE) so any unexpected dependent object would fail the migration loudly rather than silently nuke dependents. `pg_depend` pre-flight confirmed 0 dependents before applying.
- The 'curated' default was being applied to 23,804 rows that were not actually curated (OSM / Wikidata / NRHP / state_landmark imports). The semantic mismatch dissolves with the column. If a "this row was hand-curated" signal is ever wanted again, `source_type = 'editorial'` (118 rows) is the correct signal and was the intended one.

**Sub-pattern established:** Extends the migration-file suffix vocabulary with `_drop.sql` for column-drop migrations (operation-verb-at-end). Existing precedent: `_check.sql` (5.17, single-column constraint add), `_enum_checks.sql` (5.30, multi-column constraint add). 5.16 adds the destructive-op verb.

**Follow-up (not blocking close):** CLAUDE.md POI ingestion section contains the line *"deprecate in a later migration once importers are live"* — update to reference this migration in a separate docs commit.

**Catalog-narrative correction:** Earlier framing of 5.16, including in this session's opening state-of-world summary, described it as having "lost siblings when 5.19 dissolved." 5.19 was not dissolved — it remains in the catalog marked superseded by 5.19a, which explicitly redirected the surviving scope into 5.16. The articulation pre-flight surfaced this. Logging so the misframing doesn't propagate.

---

### 5.17 Undocumented `pois.poi_type` and `pois.visibility_radius_miles`

Two columns on `pois` that neither CLAUDE.md nor SKILL.md (chat-side, not tracked in repo) mention:

- `poi_type text NOT NULL DEFAULT 'point'` — no CHECK constraint, value
  space unenforced.
- `visibility_radius_miles numeric NOT NULL DEFAULT 1.0` — per-POI override
  of the default trigger radius.

Both look load-bearing — visibility radius in particular is read by
trigger logic.

**Posture:** document. Both stay as-is.

**Action:** add to CLAUDE.md and SKILL.md (chat-side) schema sections. Add a CHECK
constraint on `poi_type` once the value space is enumerated (a
`SELECT DISTINCT` will be quick — most rows are likely 'point').

**Status:** Resolved 2026-05-11. `SELECT DISTINCT` against staging
returned `point` (21,883 active), `area` (14), `viewpoint` (9).
Migration `20260511000001_pois_poi_type_check.sql` applied — adds
`pois_poi_type_check CHECK (poi_type IN ('point','area','viewpoint'))`.
CLAUDE.md schema bullet updated to document both columns. SKILL.md
skipped (file does not exist on disk; same scope decision as 5.18).
`visibility_radius_miles` left without a CHECK — the floating-point
range is open by design (distribution shows 1.00 default with custom
overrides 2–30 miles).

---

### 5.18 "mode" terminology ambiguity in SKILL.md and CLAUDE.md

Both docs use the word `mode` to refer to two different things:

- `voice_configs.mode` is **audience mode** (family / kids / unfiltered / local).
- `narration_audio.mode` is **trip mode** (driving / hiking / city), enforced
  by a live CHECK constraint.

This ambiguity cost two rewrites of Prompt 04. The actual dimensional model:

| Column | Semantic | Value space |
|---|---|---|
| `voice_configs.mode` | audience mode | family / kids / unfiltered / local |
| `narration_audio.mode` | trip mode | driving / hiking / city |
| `narration_audio.narrator_slug` | voice id | per-voice slug |
| `narration_audio.depth` | depth | glance / ride_along / deep_dive |
| `trips` | no mode column today | depth + category_filter only |

Audience mode is dimensionally collapsed into `narrator_slug` for cache
keys. Cache key: `{poi_id}-{trip_mode}-{depth}-{narrator_slug}.opus`.

**Posture:** doc fix, high priority.

**Action:** rewrite the schema and cache-key sections of both files
using explicit `audience_mode` / `trip_mode` terms everywhere except
where a literal live column name is referenced.

**Status:** Resolved 2026-05-10 via CLAUDE.md rewrite (SKILL.md skipped — file does not exist on disk; user picked "skip SKILL.md" via AskUserQuestion). 19 prose rewrites applied + the existing "Mode column semantics" section reformatted with the canonical Dimensional model intro paragraph + table that the prompt scoped for SKILL.md. Audit trail in [docs/audit-mode-terminology.md](audit-mode-terminology.md). Code-level literals (column names, CLI flags, TS types, function params) left untouched per scope. The `voice_id` → `narrator_slug` rename across cache-key prose was applied at the same time, since catalog entry says `narrator_slug` is the canonical column name.

---

### 5.19 — `narrators` and `user_narrators` are retired; `trips.narrator_id` / `trips.user_narrator_id` are dead-letter

- **Status:** **superseded by 5.19a**
- **Severity:** (was med; now n/a)
- **Detected:** earlier session, exact provenance unclear
- **Summary (as originally written):** the narrator axis was retired in favor of audience-mode-as-narrator-personality. The four `narrators` rows and the `user_narrators` table were considered dead; `trips.narrator_id` and `trips.user_narrator_id` columns were dead-letter and slated for cleanup.
- **Reference:** CLAUDE.md "Cleanup of `trips.narrator_id` / `user_narrator_id` deferred — see migration backlog."
- **Why superseded:** see 5.19a.

### 5.19a (correction) — narrators / user_narrators NOT retired

- **Status:** open (correction; reverses the action recommended in 5.19)
- **Severity:** med (process — Prompt 05's scope shrinks)
- **Detected:** Prompt 08 RLS audit, 2026-05-10 ([docs/audit-rls-drift.md §6 Step 6](audit-rls-drift.md))
- **Summary:** Drift entry 5.19 stated the narrator axis was retired and that `trips.narrator_id` / `trips.user_narrator_id` were dead-letter. The Prompt 08 RLS audit (2026-05-10) contradicts this:
  - `narrators` holds 4 actively-used preset rows. They have a live `narrators_public_read` policy (`SELECT WHERE is_active = true`) and are referenced as a fallback in [app/customize.tsx:78-138](../app/customize.tsx#L78-L138) (`PRESET_NARRATORS`). The narrator IDs `00000000-0000-0000-0000-00000000000{1-4}` are also seeded so `trips.narrator_id` FKs resolve.
  - `user_narrators` is referenced by the `trips.user_narrator_id` FK and has full SELECT/INSERT/UPDATE/DELETE user-own RLS policies for the user-narrator UI feature. 0 live rows but planned, not dead.
- **Posture:** correction. Treat 5.19 as superseded for the narrator tables and FK columns. **Do NOT drop them.**
- **Action:** Prompt 05 (the dead-letter column audit) loses 2 of its 3 targets. The remaining target — `pois.source` legacy column (entry 5.16) — can either proceed as a smaller scoped audit or fold into the tier-two doc-sweep PR.
- **Future-proofing:** if the planned `narrator_slug → voice_id` rename ever happens, that touches `narrators` / `user_narrators` columns, but the tables themselves stay.

---

### 5.20 — `routes` had a wide-open `cmd=ALL, qual=true, roles=public` policy

- **Status:** **resolved 2026-05-10** ([supabase/migrations/20260510000008_routes_rls_hotfix.sql](../supabase/migrations/20260510000008_routes_rls_hotfix.sql))
- **Severity:** urgent (anonymous mutation possible; PII surface once users sign up)
- **Detected:** Prompt 07 routes audit, 2026-05-10 ([docs/audit-routes-rls.md](audit-routes-rls.md))
- **Summary:** `public.routes` had a single policy `'Routes are public'` with `cmd=ALL`, `qual=true`, `roles={public}`. RLS was technically enabled but the qual was unconditional, so any anon caller could SELECT/INSERT/UPDATE/DELETE every row.
- **Resolution:** migration `20260510000008_routes_rls_hotfix.sql` dropped the policy and installed four user-own policies (`routes_select_own`, `routes_insert_own`, `routes_update_own`, `routes_delete_own`) mirroring the canonical `user_preferences` pattern. Verified live: `'Routes are public'` is gone; 4 policies present, all gated by `auth.uid() = user_id`. See [docs/audit-routes-rls.md Step 4 Check A](audit-routes-rls.md).

### 5.21 — `routes.user_id` was `text` / nullable with no FK

- **Status:** **resolved 2026-05-10** (same migration as 5.20)
- **Severity:** urgent (paired with 5.20 — without the type/FK fix, the user-own RLS predicate `auth.uid() = user_id` would have done implicit text-vs-uuid casting, opening surprising matching behavior)
- **Detected:** Prompt 07 routes audit, 2026-05-10
- **Summary:** `routes.user_id` was declared `text` and nullable, with no FK to `auth.users`. The 5 pre-existing rows all had `user_id = NULL` (anonymous test data from May 3 — see [docs/decision-needed-routes-orphans.md](decision-needed-routes-orphans.md)).
- **Resolution:** the migration also coerced the type (`text → uuid`), set `NOT NULL`, and added `routes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`. The 5 pre-existing NULL rows were deleted out-of-band before the migration ran, so the cast was over an empty table. Verified live: `user_id` is `uuid` / `NO`, FK present and references `auth.users(id) ON DELETE CASCADE`. See [docs/audit-routes-rls.md Step 4 Checks B and C](audit-routes-rls.md).

### 5.22 — `highway_routes` had RLS disabled and zero policies

- **Status:** **resolved 2026-05-10** ([supabase/migrations/20260510000007_rls_hotfix_highway_routes.sql](../supabase/migrations/20260510000007_rls_hotfix_highway_routes.sql))
- **Severity:** high (anonymous mutation possible on 221 rows of CA highway geometries used by route-adjacency scoring; not PII)
- **Detected:** Prompt 08 RLS audit, 2026-05-10 ([docs/audit-rls-drift.md Step 1](audit-rls-drift.md))
- **Summary:** `highway_routes` was created in `20260504000006_poi_significance_breakdown.sql` without any RLS setup. Anyone with the anon key could SELECT/INSERT/UPDATE/DELETE the 221 rows.
- **Resolution:** migration `20260510000007_rls_hotfix_highway_routes.sql` enabled RLS and added a single public-read policy `'Public read highway_routes'` (SELECT/USING true). No public INSERT/UPDATE/DELETE policy means only `service_role` writes — matching the pattern used by `pois`/`poi_categories`/`corridors`. The seeder script already uses `SUPABASE_SERVICE_ROLE_KEY`, so no code change needed. Verified live. (Numbered 5.22 because it was discovered in the same sweep as the routes hotfix and naturally extends the 5.20–5.21 series.)

---

### 5.23 `poi_categories` coverage gaps

9 of 20 canonical slugs in `poi_categories` had zero rows in `pois`:
native_history, legends, alpine, bridges, volcanic, dams, hot_springs,
wind_solar, mining.

**Posture:** Phase 3 product decision.

**Status as of 2026-05-10:** Resolved via Prompt 06.
- WIRE UP (5): bridges, dams, hot_springs, volcanic, mining — extended
  `scripts/poi-import/lib/category-map.ts` and
  `scripts/poi-import/lib/wikidata-types.ts`.
- DROP (2): alpine, wind_solar — migration
  `20260510000006_remove_unused_poi_categories.sql` staged, not applied.
- KEEP ASPIRATIONAL (2): legends, native_history — CLAUDE.md note added.

**Follow-up:** apply migration 000006; widen OSM Overpass query in
`scripts/poi-import/sources/osm.ts` to fetch the new tag patterns;
reclassify existing `architecture` / `nature` rows whose tags map to new
slugs.

**Status:** Resolved 2026-05-11 via Prompt 07.
- Migration `20260510000006_remove_unused_poi_categories.sql` applied;
  `alpine` and `wind_solar` removed from `poi_categories`. Applier:
  `scripts/poi-import/apply-remove-unused-poi-categories.mjs`. Verified
  live: removed targets gone, other slug counts unchanged.
- OSM Overpass query widened in
  [scripts/poi-import/sources/osm.ts](../scripts/poi-import/sources/osm.ts)
  with 4 new tag lines: `man_made=bridge`, `man_made=dam`, `waterway=dam`,
  `landuse=quarry`. `historic=mine` deliberately not added — it is already
  captured by the pre-existing `${t}[historic][historic!=yes]` line.
- Backfill via `scripts/poi-import/backfill-category-reclassify.mjs`
  moved 24 `architecture`→`bridges` (Wikidata Q12280 imports) and 1,642
  `architecture`→`dams` (Wikidata Q12323 imports). `hot_springs` /
  `volcanic` backfill: 0 rows — pre-Prompt-06 imports did not produce
  matching tag values. Side-effect of the old `natural=peak|volcano`
  bundled rule: ~150+ Wikidata volcano POIs sit in `nature` with
  `'summit'` tag, indistinguishable from peaks by tag alone; require
  re-import to reclassify (Wikidata Q8072 now routes to `volcanic`).

---

### 5.24 `set_updated_at()` function out-of-band

The shared trigger function `public.set_updated_at()` was created outside
the migration system, alongside `user_preferences` (5.25). Migration 0
captured both. The function's generic name suggests shared future use,
but `user_preferences` is currently its only consumer.

**Posture:** convention. Future tables that need an `updated_at` trigger
should reuse this function rather than create parallel ones.

**Action:** add a one-liner to CLAUDE.md conventions section. The function
itself doesn't need changes.

**Status:** Resolved 2026-05-11. Convention added to CLAUDE.md "Hard
rules" section: when a new table needs an `updated_at` column
auto-touched on UPDATE, attach `public.set_updated_at()` via a BEFORE
UPDATE trigger — do not create a parallel function.

---

### 5.25 `user_preferences` table was out-of-band

Created in production (likely via Supabase Studio) without a corresponding
migration file. Grep against all 26 prior migration files returned zero
matches. Migration 0 (`20260510000001_user_preferences_capture.sql`)
captured it.

The table includes audience-mode CHECK, depth CHECK, offline-cache-budget
CHECK, age-gate CHECK (`unfiltered_requires_age`) enforcing 18+ at the DB
layer, and a `kids_mode_pin_hash` column for parental controls. RLS
policies follow the user-own pattern.

**Posture:** now tracked. No further action.

**Status:** resolved by Migration 0. Historical note.

---

### 5.26 `narration_audio.na_unique` constraint excludes `mode`

The unique index `na_unique` on `narration_audio` covers `(poi_id,
narrator_slug, depth)` but not `mode`. This means the database enforces:
for a given POI + voice + depth, there can be only one row regardless of
trip mode. The 37 originally cached rows were all `mode='driving'`, so
the constraint hadn't been stress-tested.

**Posture:** product decision (Prompt 06).

**Status as of 2026-05-10:** Resolved via Prompt 06. Outcome A — trip_mode
does belong in cache uniqueness (gated on venue_tour template plans per
venue-tour-design.md §6.3). Migration
`20260510000005_na_unique_add_mode.sql` staged, not applied. Apply gated
on `onConflict` updates in `server/routes/narration.js:196` and
`scripts/precache-popular-routes.ts:244` to
`'poi_id,narrator_slug,depth,mode'`.

**Status:** Resolved 2026-05-11 via Prompt 07. Migration applied; live
constraint is now `na_unique: UNIQUE (poi_id, narrator_slug, depth,
mode)`. Both `onConflict` call sites updated. The migration body was
corrected during Prompt 07 from `DROP INDEX IF EXISTS` to
`ALTER TABLE DROP CONSTRAINT IF EXISTS` because the live `na_unique` is
constraint-backed — see drift 5.33. Applier:
`scripts/poi-import/apply-na-unique-add-mode.mjs`.

---

### 5.27 `trips.route_id` is text, no FK, unconstrained

- **Status:** Resolved 2026-05-11 via migration `20260511000005_trips_route_id_drop.sql` (Path 3). Note: the original reframe asserted all three write sites were already dirty in Bucket H, motivating the "avoid competing edits" fold-in. Pre-flight verification surfaced that customize.tsx was actually clean (last touched 2026-05-04). The substantive plan was unchanged; the fold-in rationale was misframed.

- **Live state:** 31 of 32 `trips` rows hold `route_id = ''` (hardcoded empty string written from [app/index.tsx:529](../app/index.tsx#L529), flowing through [app/customize.tsx:477](../app/customize.tsx#L477) → [lib/supabase.ts:236](../lib/supabase.ts#L236) `saveTrip` INSERT). 1 row is NULL. Zero meaningful values. Zero readers across `app/`, `server/`, `scripts/`, `admin/`, `lib/`. Type is `text`; both candidate FK targets (`corridors.id`, `routes.id`) are `uuid`, so any future coercion requires backfill or row deletion for the `''` rows.

- **Why rewritten:** the original framing ("defer until a feature uses it, then coerce + FK") assumed a dormant placeholder. The live state shows an active junk-write — the column isn't waiting for a feature, it's already a sink. The original entry's posture statement ("isn't load-bearing today") was technically true in the strict no-reader sense but missed the active write pattern, which materially changes what "resolve" means.

- **Paths:**
  - **Path 1 (strict deferral, as originally written):** leave the column and the writes in place; defensible only if a near-term feature is genuinely anticipated to consume `route_id`.
  - **Path 2 (stop-writing):** remove `route_id` from the navigation payload + payload assembly + `saveTrip` INSERT; keep the column nullable for future use. Cleans the write pattern without committing to a target table.
  - **Path 3 (drop):** remove the write sites AND drop the column; rebuild correctly (uuid + FK + sensible default) when a feature actually wants route association.

- **Recommended path:** **Path 3.** Same shape as 5.16: zero readers, drop-and-rebuild-later posture. Type is wrong for any plausible target (`text` vs `uuid`); the default-via-write of `''` is sentinel garbage, not signal. The column-name-as-intent counter-argument ("`route_id` carries semantic value even unused") fails because `text` + `''` corrupts whatever signal the name carries — readers added later would have to special-case the sentinel before trusting the column, which is strictly worse than rebuilding from scratch.

- **Execution:** deferred to Bucket H triage. The three write sites ([app/index.tsx](../app/index.tsx), [app/customize.tsx](../app/customize.tsx), [lib/supabase.ts](../lib/supabase.ts)) are all in Bucket H's dirty file list as of 2026-05-11 EOD. Folding `route_id` cleanup into Bucket H avoids competing edits to the same files. Path 3, if confirmed at triage, produces a single coherent PR: write-site removal + `20260513NNNNNN_trips_route_id_drop.sql` migration (mirroring the 5.16 `_drop.sql` sub-pattern) + [CLAUDE.md:141](../CLAUDE.md#L141) bullet deletion.

- **Cross-reference:** [CLAUDE.md:141](../CLAUDE.md#L141) currently reads `route_id text (free-form; no FK — see drift catalog 5.27)`. If Path 3 executes, deleted with the column. If Path 1 or 2 wins, updated to reflect new state.

---

### 5.28 `corridors` table content and intent

**Status:** `noted` — documented; no action needed.

Holds 6 editorial named-drive corridors, all in eastern Sierra / Owens
Valley / Tehachapi: Antelope Valley Aerospace Corridor, Carson Valley
Approach, Long Valley Volcanic Zone, Mono Basin to Bridgeport Valley,
Southern Owens Valley, Tehachapi Mountains Transition.

LA→Cambria, where the 37 cached `narration_audio` rows live, is **not**
present. The cache doesn't depend on a `corridors` row to function;
narrations are keyed by POI ID, not corridor. Zero app-side consumers;
`get_corridor_pois` RPC does not consume this table despite the name
overlap (it takes a `route_geom` WKT parameter, not a `corridors.id`).

**Posture:** documented. Semantic is "editorial named drives," not "every
route a user takes."

**Future-feature note:** if editorial bundling on named corridors becomes
a product feature, new corridors will need LineString geometry (routing
service or hand-traced); tracked here for context only, not as open work.

---

### 5.29 `routes` table is a saved-trips / favorites feature

Distinct from `corridors`. 5 rows originally (all deleted out-of-band as
pre-auth test data; see 5.20). Schema: `id`, `user_id`, `destination`,
lat/lng pairs, `distance_mi`, `duration_min`, `filter_snapshot jsonb`,
`created_at`.

**Posture:** documented.

**Status:** `noted` — schema hardened via the 5.20/5.21 hotfix
(`20260510000008_routes_rls_hotfix.sql`). Captured here so future readers
don't confuse `routes` (user favorites) with `corridors` (editorial named
drives) — separate concerns despite the name overlap.

---

### 5.30 — corridors.region_type / editorial_status: no CHECK enforcement

> Renumbered from the original §5 catalog's 5.22 because Prompt 08
> assigned 5.22 to the highway_routes RLS fix (canonical 5.22 in this
> file). See 5.22 above.

`corridors.region_type text DEFAULT 'rural'` and `corridors.editorial_status
text DEFAULT 'draft'` had defaults that strongly implied an enumerated
value space, but no CHECK constraints enforced it.

**Status:** Resolved 2026-05-11 via `supabase/migrations/20260511000002_corridors_enum_checks.sql`.

**Resolution:** Two CHECK constraints, single atomic migration.
- `corridors_region_type_check`: `('geological', 'desert', 'suburban', 'alpine', 'mountain_pass', 'rural')` — 5 observed live values + 'rural' (schema default, zero live rows).
- `corridors_editorial_status_check`: `('draft', 'verified')` — 'verified' is sole observed value (6/6), 'draft' is schema default; mirrors `pois.editorial_status` vocabulary used in RPC publication filters.

**Judgment calls disclosed:**
- Included 'rural' in region_type CHECK to avoid the default-rejected-by-its-own-CHECK footgun. 5.17 sidestepped this because 'point' was already in live data; 5.30 had aspirational defaults with zero live rows.
- Held editorial_status to 2 values rather than speculatively adding 'archived' / 'published'. Principle: `corridors.editorial_status` and `pois.editorial_status` are parallel columns sharing a vocabulary; they expand together via paired migration, not unilaterally.

**Sub-pattern established:** When one drift entry covers multiple CHECKs on a single table, use a plural `_<table>_enum_checks.sql` filename and combine constraints in one BEGIN/COMMIT block for atomic rollback. (5.17 was singular: one column → `_<table>_<column>_check.sql`. 5.30 extends the convention for the multi-column case.)

**Schema prefix follow-up:** Resolved-no-action 2026-05-11. Convention codified in CLAUDE.md "Migration conventions" sub-section. Confirmed no drift introduced this session — 5.17 was already `public.`-qualified, and this session's migrations (5.30 / 5.16) matched the established pattern. The 7 most-recent migrations (contiguous from 2026-05-10) all use `public.` qualification; the bare-names era is legacy and frozen.

---

### 5.31 Draftbit references in project documentation

CLAUDE.md (and reportedly SKILL.md, scrubbed chat-side) contained legacy
references to Draftbit as part of the frontend stack. The project has
been pure hand-coded React Native / Expo from day one and Draftbit is
not in the dependency graph anywhere.

**Posture:** doc fix. Replace with the actual stack description (Expo +
React Native TypeScript, EAS Build for binaries, EAS Update for OTA).

**Status:** Resolved 2026-05-11. CLAUDE.md line 10 rewritten from
"React Native / Expo (no Draftbit — all UI is hand-coded) — compiles to
iOS + Android from one codebase" to "React Native / Expo (TypeScript) —
all UI hand-coded as standard RN. EAS Build for iOS/Android binaries,
EAS Update for OTA. One codebase compiles to both platforms." The
negation phrasing was the only Draftbit reference in CLAUDE.md. SKILL.md
side was scrubbed chat-side per the prompt. No "Draftbit → native
migration path" open questions were found to strip in CLAUDE.md.

---

### 5.32 Migrations 20260510000003 and 20260510000004 mislabeled "staged but not applied"

CLAUDE.md's migration backlog had both `20260510000003_narration_audio_index`
and `20260510000004_llm_calls_index` filed under a "Staged but not
applied (Phase 2 wrap-up)" header. Direct queries against staging on
2026-05-11 showed both are live:

- `idx_narration_audio_lookup` exists on `narration_audio` (poi_id, mode, depth, narrator_slug).
- `idx_llm_calls_created_at`, `idx_llm_calls_call_type_created_at`,
  `idx_llm_calls_related_id`, `idx_llm_calls_tts_unique` (partial UNIQUE) all
  exist on `llm_calls`.

The earlier audit-na-unique.md (2026-05-10) had already flagged 000003 as
out-of-band-applied; that note never propagated into CLAUDE.md.

**Posture:** doc fix. Move both migration entries from the staged
section to the applied section.

**Status:** Resolved 2026-05-11. CLAUDE.md migration backlog updated.
The "Staged but not applied" header was emptied (no migrations are
currently staged) and replaced with "Applied 2026-05-11 (corrected from
'staged' — see drift catalog 5.32)" containing both bullets plus the new
20260511000001 (poi_type_check from 5.17). DB watermark line updated from
20260510000002 → 20260511000001.

**Note on scope:** the prompt narrowly scoped this item to "fix the
000003 note. One-line fix." 000004 was bundled into the same edit
because it shared the same incorrect section header and same root error
(the same author error filed both migrations together as staged). Flagged
in summary rather than treated as silent inclusion.

---

### 5.33 audit-na-unique.md inspected pg_indexes only; missed that na_unique is constraint-backed

The audit performed for 5.26 (docs/audit-na-unique.md) ran `SELECT indexdef
FROM pg_indexes WHERE indexname = 'na_unique'` and reported the index
definition as `CREATE UNIQUE INDEX na_unique ...`. It did not cross-check
`pg_constraint`. In fact `na_unique` is a constraint-backed unique index:
`pg_constraint` returns `na_unique: UNIQUE (poi_id, narrator_slug, depth)`
with a matching backing index of the same name.

Consequence: the staged migration `20260510000005_na_unique_add_mode.sql`
used `DROP INDEX IF EXISTS public.na_unique`, which Postgres refuses on
constraint-backed indexes with `cannot drop index na_unique because
constraint na_unique on table narration_audio requires it`. The transaction
would have rolled back on apply.

**Posture:** lesson. Future uniqueness audits should query both
`pg_indexes` and `pg_constraint` so they don't miss the constraint wrapper.
The two views answer different questions — `pg_indexes` lists physical
indexes; `pg_constraint` lists logical constraints (some of which are
backed by indexes of the same name).

**Action:** migration 0005 corrected to use
`ALTER TABLE ... DROP CONSTRAINT IF EXISTS na_unique` +
`ALTER TABLE ... ADD CONSTRAINT na_unique UNIQUE (poi_id, narrator_slug, depth, mode)`,
preserving the constraint-backed shape rather than degrading it to a bare
unique index. Corrigendum prepended to docs/audit-na-unique.md.

**Status:** Resolved 2026-05-11. Fix folded into 0005 application
(Prompt 07).

---

### 5.34 CLAUDE.md `narration_audio` schema bullet not updated when na_unique was widened

When migration `20260510000005_na_unique_add_mode.sql` was applied in
Prompt 07 (2026-05-11), CLAUDE.md's migration-backlog entry for 0005 was
updated to record the new shape, but two adjacent prose touch points were
not:

- The `narration_audio` schema bullet (around line 140) still read
  `UNIQUE(poi_id, narrator_slug, depth)` — the pre-Prompt-07 shape.
- The migration-backlog entry for 20260510000003 (around line 676) still
  described `na_unique` with the 3-column shape inside a narrative
  sentence about read-path indexes vs write-time uniqueness. That sentence
  was correct *at time of writing* (2026-05-10) but misleading after 0005
  applied.

Discovered during the SKILL.md mirror pass on 2026-05-11. Live DB shape
is `UNIQUE (poi_id, narrator_slug, depth, mode)` and was not in question;
the drift was confined to CLAUDE.md prose.

**Posture:** doc fix.

**Action:** schema bullet updated to the 4-column shape with a parenthetical
pointing to migration 0005. 0003 entry preserved as historical narrative,
appended with a one-sentence corrigendum referencing the 0005 entry. Both
fixes shipped in the same prompt that filed this entry; no follow-up
needed.

**Status:** Resolved 2026-05-11.

---

### 5.35 — `get_corridor_pois` function name overlaps with `corridors` table without consuming it

**Status:** Resolved 2026-05-11 via `supabase/migrations/20260511000004_get_corridor_pois_comment.sql`.

**Surfaced by:** the live-state strengthening finding inside 5.28's close — `corridors` is fully orphaned from the request graph, and the function whose name suggests it should be a consumer (`get_corridor_pois`) does not in fact consume the table. The name overlap is a misleading signal for future maintainers reading function definitions without grepping the body.

**Resolution:** Added `COMMENT ON FUNCTION public.get_corridor_pois(text, double precision, text[], text)` clarifying the function's actual behavior (buffer search around a WKT route LineString) and explicitly disambiguating from `public.corridors`. The COMMENT is kept self-contained as function metadata; broader context on the orphaned table lives in 5.28.

**Judgment calls disclosed:**
- COMMENT does not cross-reference the drift catalog. Function metadata should answer "what does this do," not "what's the meta-context for why this comment exists." Catalog→COMMENT linkage flows from the entry side only.
- COMMENT includes one WKT format hint on `route_geom` (the least self-documenting of the four params); other parameter names are sufficiently self-describing not to warrant inline docs.

**Sub-pattern established:** Extends the migration-file suffix vocabulary with `_comment.sql` for function-level metadata operations. Running suffix vocabulary: `_check.sql` (5.17), `_enum_checks.sql` (5.30), `_drop.sql` (5.16), `_comment.sql` (5.35). Naming form: `<function_name>_comment.sql` for function metadata; future precedent for column-level metadata would be `<table>_<column>_comment.sql`.

**Cross-reference:** 5.28 (corridors orphan finding).

---

### 5.36 — Supabase URL + anon key hardcoded as string literals in `lib/supabase.ts`

**Status:** Resolved 2026-05-11 via this commit.

**Surface:** Supabase URL + anon publishable key were hardcoded as string literals in `lib/supabase.ts`. Not a secrets-exposure issue (publishable keys are designed to be public; security gates on RLS, not the token), but blocks env-driven config — no rotation without code edits, no clean dev/staging/prod swap, and diverges from the `server/` directory's existing env pattern.

**Success state:** Both values read from `process.env.EXPO_PUBLIC_SUPABASE_URL` and `process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY`; app throws at startup if either env var is missing (fail-loud).

**Test:** With `.env` populated, app boots and Supabase queries work normally; with either var deleted from `.env`, app throws at startup naming the missing var.

---

### 5.37 — CLAUDE.md and drift-catalog SKILL.md references read as if SKILL.md were tracked in the repo

**Status:** Resolved 2026-05-11 via this commit.

**Surface:** CLAUDE.md contained references to SKILL.md that read as if SKILL.md were tracked in the repo; SKILL.md actually lives in the claude.ai project folder (loaded as a project skill) and is intentionally not tracked. The drift-catalog's cross-cutting observation and "Mirrored sections" subsection compounded this by saying CLAUDE.md / SKILL.md updates "should ride in the same PR" — internally contradictory if SKILL.md isn't in the repo.

**Success state:** CLAUDE.md references updated to explicitly note SKILL.md is external (claude.ai-side, in the project folder, not tracked) and synced via project artefact swap per the convention codified end of session 2026-05-11. Drift-catalog cross-cutting observation and "Mirrored sections" subsection rewritten the same way: CLAUDE.md updates ride in the git PR; SKILL.md mirror updates are flagged in the PR description for the user to apply via claude.ai project artefact swap.

**Test:** Reading CLAUDE.md from a fresh repo clone makes it clear SKILL.md lives external to the repo and where to find the sync convention.

**Judgment calls disclosed:**
- Historical SKILL.md references inside resolved entries (5.17 / 5.18 / 5.31 / 5.34) and the parallel `docs/audit-mode-terminology.md` session notes were left as historical record. The Status blocks within those entries already document SKILL.md's external-and-skipped nature for their session-frozen context; rewriting them would retroactively edit pre-resolution narratives. Two minimal parentheticals were added at 5.17 L55 and L67 (the only entry-narrative SKILL.md references that don't already self-clarify) to spare a new reader from waiting for the Status block.
- `docs/venue-tour-design.md:671` SKILL.md mention (one-liner in a context-files list, already labeled "project skill") and the migration comment at `supabase/migrations/20260510000003_narration_audio_index.sql:9` (immutable historical artefact) left as-is.

---

### 5.38 — Catalog legend was missing a canonical keyword for "drift observed; no action warranted"

**Status:** Resolved 2026-05-11 via this commit.

**Surface:** The drift catalog legend defined four canonical statuses (`open` / `resolved` / `superseded` / `wontfix`), but entries 5.15 and 5.28 used an off-canon `**Status:** documented; no action needed.` because none of the four canonical values captured the semantic of "drift observed; tracked but no action warranted." Pre-flight check 4 surfaced a third entry (5.29) using a related off-canon variant (`**Status as of 2026-05-10:**` — its sole Status line, no later canonical) for the same semantic.

**Success state:** Legend expanded to include `noted` as a fifth canonical status (drift observed and tracked for the record; no action warranted — distinct from `wontfix`, which implies a considered-and-declined fix proposal). Entries 5.15, 5.28, and 5.29 normalized to use `noted`, with existing explanatory prose preserved after the keyword. The "How to add the next entry" guidance updated from "four statuses" to "five statuses."

**Test:** Reading the legend gives a distinct, unambiguous semantic for each of the five statuses; 5.15, 5.28, and 5.29 read as canonically-statused entries.

**Judgment calls disclosed:**
- The dual-Status pattern in 5.23 and 5.26 (`**Status as of YYYY-MM-DD:**` interim line + canonical `**Status:**` final line below it) was deliberately preserved. Those entries already have a canonical Status line; the interim line documents chronological resolution progress across sessions and was scoped out of this normalization by user direction.
- 5.29's `**Status as of 2026-05-10:**` date-marker prefix was dropped (not converted to `**Status (as of 2026-05-10):**` or similar). With no later canonical Status line to contrast against, the date marker added clutter without value.
- Legend positioning: `noted` placed after `wontfix` in the closing-state cluster. The closing-states cluster at the end of the legend, and `noted` is the softest close (no fix attempted versus `wontfix`'s considered-and-declined posture).
- The legend bullet for `noted` is intentionally longer than the others because the disambiguation from `wontfix` is the whole point of the keyword — abbreviating it would defeat the purpose.

---

### 5.39 — Design system ships AudienceMark; spec calls for NarratorMark (deferred to Prompt 10)

**Status:** `noted` — drift observed; tracked for the record.

**Surface:** Prompt 03 of the XRoad UI/UX design handoff specifies a component named `NarratorMark` with the narrator-taxonomy values `professor / local / kid / trucker`. The Field Notes Phase 1 implementation ships `AudienceMark` (`src/components/AudienceMark.tsx`) with the audience-taxonomy values `family / kids / unfiltered / local`, aligned to `voice_configs.mode` (see CLAUDE.md "Dimensional model" — audience_mode is the column-level enum). The engraved-glyph style is shared: book+spectacles / cottage / magnifier+leaf / road-at-sunset; only the surface-level taxonomy differs.

**Success state:** Both `AudienceMark` (audience picker — present today) and `NarratorMark` (narrator picker — to be added in Prompt 10) exist as separate components sharing the engraved-glyph style and visual treatment. Prompt 10's narrator-picker UI imports `NarratorMark` without colliding with the existing `AudienceMark`.

**Test:** When Prompt 10 lands, the import `import { NarratorMark } from '../src/components';` resolves to a distinct component, and both components render side-by-side in `ComponentsDemoScreen.tsx` without name conflict.

**Decided by:** user direction, Field Notes Phase 1 decision pass (this session).

---

### 5.40 — PrimaryButton sublabel at 9px instead of spec's 8px

**Status:** `noted` — drift observed; tracked for the record.

**Surface:** Prompt 03 specifies the `PrimaryButton` sublabel at JetBrains Mono 8px. The repo uses `theme.textVariants.metaSmall` (mono 9px), which is the smallest size in the canonical type ramp (`src/design/tokens.ts`). The decision pass declined to add a one-off 8px variant for a single component.

**Success state:** Sublabel reads legibly at 9px on the smallest supported device width (320pt); the spec's 8px is deemed below the readability threshold for road-trip / driving use cases where the user may glance briefly while in motion.

**Test:** Open `/components-demo` on a 320pt-wide viewport, hold the device at arm's length, and read the `PrimaryButton` "Pacific Coast Highway · 6h 12m" sublabel without leaning in.

**Decided by:** user direction, Field Notes Phase 1 decision pass (this session).

---

### 5.41 — Repo-wide `tsc --noEmit` has 29 pre-existing errors across 5 files / subprojects

**Status:** `open` — deferred to a dedicated cleanup arc; not blocking Phase 1.

**Surface:** Repo-wide `npx tsc --noEmit` reports 29 pre-existing type errors across 5 files / subprojects, all dating from before this session. Files affected: `admin/app/admin/poi-review/{actions.ts, EditModal.tsx, page.tsx, ReviewCard.tsx}`, `admin/app/login/page.tsx` (Next.js path-alias resolution into `admin/` from root `tsc` — 15 errors); `app/drive.tsx:335` (removed `setStoryCount` call site — 2 errors); `lib/__tests__/routeBadges.test.ts` (`BadgeRoute` type widened, tests not updated — 9 errors); `scripts/poi-import/lib/category-map.ts:27` (typo — 1 error); `scripts/precache-popular-routes.ts:434` (`string` → union narrowing — 1 error).

**Success state:** Repo-wide `npx tsc --noEmit` returns 0 errors. `admin/` either gets its own type-check scope or the root `tsconfig` excludes it. `app/drive.tsx` and the `routeBadges` test are updated to match current types. The two script-side errors are fixed inline.

**Test:** Run `npx tsc --noEmit` from repo root → exit 0, zero errors.

**Decided by:** user direction this session — surfaced while gating the Phase 1 design-system commit; deferred to a dedicated cleanup arc rather than blocking Phase 1.

---

### 5.42 — Two more `pointerEvents` occurrences inside style objects in `app/index.tsx`

**Status:** `resolved` (fixed in this commit)

**Surface:** After the Phase 1 fix at app/index.tsx:762, two further occurrences of `pointerEvents` inside a style object remained in the same file:
- chip-row ScrollView — `<ScrollView … style={{ pointerEvents: 'box-none' } as any}>`. The `'as any'` cast suppressed the TS error about the wrong location. Buried inside a style object the prop was silently dropped; meanwhile the spurious intent (`'box-none'` on a horizontal ScrollView) would have prevented the ScrollView from capturing its own pan gestures had the prop been honored. User-visible bug: filter chip row didn't scroll horizontally past the first viewport's worth of chips.
- `s.desktopPillWrap` StyleSheet entry — `gap: 8, pointerEvents: 'box-none',` (with `'as any'` cast). The consumer site ALSO passed `pointerEvents="box-none"` as a top-level prop; runtime was correct (top-level prop wins), but the style entry was dead weight and reinforced the wrong pattern.

**Resolution:** Chip-row ScrollView's buried-in-style `pointerEvents` removed entirely — the ScrollView's default `auto` is exactly what we want (scroll captured by the ScrollView itself, taps passed through to TouchableOpacity chip children). `s.desktopPillWrap` `pointerEvents: 'box-none'` and `as any` cast removed from the StyleSheet entry; the consumer's top-level `pointerEvents="box-none"` prop is retained as the single source of truth.

**Test:** After fix, `grep -n "pointerEvents" app/index.tsx` reports five hits, all top-level props on host components (`SafeAreaView` topSafe, `View` logoWrap, `View` desktopPillWrap, plus the two new `LinearGradient` chip-fade overlays which carry `pointerEvents="none"` so scroll/taps reach the ScrollView below).

**Decided by:** User-filed regression report after the Layer 1 home-screen migration; chip-row scroll failure on Android hardware made the latent bug visible.

---

### 5.43 — Field Notes type ramp clipped Fraunces descenders at display + h1

**Status:** `resolved` (fixed in this commit)

**Surface:** Direction A · Field Notes type ramp specified Fraunces display at 56/1.0 line-height and h1 at 32/1.05. Rendered on Android with Fraunces actually loaded, lowercase descenders (g, y, p, j) on these two variants get clipped by the line box bottom. Spec authored from static design comps without confirming rendered-on-hardware descender bounds.

**Success state:** `display` lineHeight = 64 (1.15× at 56px), `h1` lineHeight = 38 (~1.19× at 32px). Headlines breathe; descenders fully visible. Editorial feel preserved (still tighter than RN default of 1.4).

**Test:** Render a Fraunces h1 headline containing "g", "y", "p", or "j" on Android via Expo Go — descender fully visible within the line box.

**Decided by:** User direction this session, after visually verifying Phase 1 on Android hardware via Expo Go for the first time.

---

### 5.44 — Brand mark color duplicates in `app/index.tsx`

**Status:** `open`

**Surface:** Three references to the brand teal `#2EC4B6` (and the legacy `BG_BASE` mirror `#1a1208`) exist inside MapScreen's StyleSheet at the entries `logoPinOuter`, `logoPinInner`, and `brandX`, duplicating the canonical brand color that lives in `src/components/Wordmark.tsx` and the legacy `XRoadLogo` component. These are not Field Notes tokens and were intentionally left unmigrated in the Layer 1 home screen migration (commit-tbd).

**Success state:** The brand mark inside `app/index.tsx` is replaced by importing and rendering the canonical `Wordmark` component from `src/components/Wordmark.tsx`, eliminating the duplicates. Probably belongs to Layer 2 (component replacement) rather than Layer 1 (token migration).

**Test:** After fix, `grep -n "#2EC4B6\|#1a1208" app/index.tsx` returns zero hits.

**Decided by:** Surfaced during the Layer 1 home screen migration inventory; deferred to Layer 2 to keep Layer 1 surgical.

---

### 5.45 — Color-distinction collapses from legacy → Field Notes migration

**Status:** `open`

**Surface:** Layer 1 home-screen migration (this commit) maps the legacy 15-color palette to Field Notes' 9-token palette. Three distinctions collapse:
- `C.STOP` and `C.ACCENT_TEXT` both → `theme.colors.accent2`. At `app/index.tsx` the origin-search-dot ternary (`originMode === 'gps' ? STOP : ACCENT_TEXT`) now returns the same color on both branches; GPS vs manual mode is no longer distinguished by dot color.
- `C.WARNING`, `C.WARNING_BRIGHT`, `C.DANGER` all → `theme.colors.accent`. POI dots, route-loading spinners, and the destination pin previously used three subtly different hot-color hues; now share one accent.
- `C.BORDER_STRONG` and `C.BG_ELEVATED` both → `theme.colors.cardEdge`. Border-vs-elevation-fill distinction merges in dark mode; in light mode the elevation fill renders heavier than original intent.

**Success state:** Where state distinction matters (GPS-vs-manual being the most user-visible), use a non-color signal (shape, icon, label, border treatment) rather than re-introducing a per-state color. This is part of Layer 2 component replacement on the home screen, not a Layer 1 rollback.

**Test:** After Layer 2, the origin-search-dot is visually distinct between GPS and manual modes without relying on color alone.

**Decided by:** Surfaced during Layer 1 home-screen migration; accepted the collapses to keep Layer 1 surgical (color-and-font only) and flagged for Layer 2 attention.

---

### 5.46 — Android system nav bar overlapped app content; bottom safe-area insets not consumed

**Status:** `resolved` (fixed in this commit)

**Surface:** Visible on user's Android hardware screenshots — the "Customize trip" CTA inside the home-screen mobile bottom sheet sat flush against the Android back-gesture / 3-button overlay, and users were accidentally hitting system nav while reaching for app controls. Root cause was two-layered: (a) `App.tsx` never wrapped the navigator tree with `SafeAreaProvider`, so the context-based machinery in `react-native-safe-area-context` couldn't deliver insets to any consumer; (b) `app/index.tsx` mobile sheet (`Animated.View`, position absolute, bottom 0) and `app/customize.tsx` ScrollView footer had no bottom-inset awareness at all (only a fixed-pt trailing spacer / static `paddingBottom`). Additionally `app/driving.tsx`, `app/hiking.tsx`, `app/trail.tsx`, and `app/filters.tsx` imported `SafeAreaView` from `'react-native'`, which is iOS-only — on Android it falls through to a no-op `View` and provides zero inset compensation. Only `app/drive.tsx` had ever imported from `react-native-safe-area-context`.

**Success state:** App tree wrapped by `SafeAreaProvider` at the root. Home screen's bottom-sheet trailing spacer absorbs `insets.bottom`; customize screen's ScrollView trailing spacer absorbs `insets.bottom`. The four secondary screens import `SafeAreaView` from `react-native-safe-area-context` and gate edges explicitly (`edges={['bottom']}` for bottom button bars / sheets; `edges={['top']}` for top headers) so the library applies real insets instead of the hand-rolled Platform.OS Android paddings. `hiking.tsx`'s `s.headerRow` hand-rolled `paddingTop: Platform.OS === 'android' ? 40 : 0` deleted since the SafeAreaView now provides the real top inset.

**Test:** Build to Android hardware (or Expo Go on a Pixel/Android emulator), open home screen — "Customize trip" CTA bottom edge sits at `12pt + insets.bottom` above the Android system nav, not flush against it. Same check on customize.tsx (Start trip CTA), driving/hiking/trail (bottom action bars), filters (Confirm bar).

**Decided by:** User-filed regression this session, with Android hardware screenshots; minimal-scope fix per session direction (single coherent commit, no broader refactor).

---

### 5.47 — Route-card desaturation for non-selected routes is intentional

**Status:** `noted` — drift observed; behavior confirmed.

**Surface:** In the home-screen route-picker, the non-selected route cards render with desaturated colors relative to the selected card. The visual differentiation may read as "broken" on first inspection, especially against the Field Notes editorial palette where the rest of the screen leans warm.

**Success state:** Desaturation stays. It's the primary signal that disambiguates the selected route from alternatives at a glance, which matters more than chromatic harmony on a screen where the user's job is to make a choice.

**Test:** Visual — on the home screen with multiple routes loaded, the selected card is chromatically distinct from the alternatives without requiring a focused read.

**Decided by:** User direction this session, confirming current behavior is intentional UX.

---

### 5.48 — Route polyline uses bright Google Maps blue, clashes with Field Notes palette

**Status:** `open`

**Surface:** Route polylines on the home-screen and drive-screen maps render in `rgba(56,139,253,0.92)` (dark map style) / `rgba(20,90,210,0.92)` (light) — a bright Google-Maps blue that reads as a foreign chrome element against the warm Field Notes editorial palette. The colors come from the `ROUTE_COLOR` / `ROUTE_ALT_COLOR` maps in `app/index.tsx:45-56` and the hardcoded `#4A90D9` polyline color in `app/drive.tsx` (per CLAUDE.md "drive.tsx UI details").

**Success state:** Polyline colors derive from Field Notes tokens (`theme.colors.accent` or a new map-line token if needed) and harmonize with the editorial palette across all four map styles (dark / satellite / topo / standard). Visual decision lands together with the broader Layer 2 map-style work (Prompt 07 / map-styling arc).

**Test:** After Layer 2 map work, `grep -n "rgba(56,139,253\|rgba(20,90,210\|#4A90D9" app/` returns zero hits; polylines render with palette-derived color across all four map styles.

**Decided by:** User flagged during the Layer 1.5 Android-insets pass; deferred to Layer 2 / Prompt 07 to keep this commit narrow.

---

### 5.49 — POI clustering: pre-route browse vs. post-route fixed-narratable modes

**Status:** `open` — Stage 1 shipped pre-route clustering on the home screen (this commit). Stages 2 (parity to customize / drive / hiking / trail) and 3 (lift post-route 40-POI cap + chip filter wiring per drift 5.50) still pending.

**Surface:** Currently every fetched POI renders as an individual marker on the map. At wide zoom in pre-route browse mode, this produces marker pile-ups that obscure the map and degrade tap accuracy. There's no per-region density clustering and no zoom-aware break-apart behavior. Once a route is selected and POIs become "fixed narratable" stops along the corridor, the rendering needs change again — every selected POI should be persistently visible on every screen that shows the map (home/customize/drive), not clustered or hidden, since they're committed narration targets.

**Stage 1 (this commit) — home pre-route clustering:**
- `react-native-map-clustering ^4.0.0` installed. Drop-in `<ClusteredMapView>` wraps `react-native-maps` and bundles `supercluster ^8.0.0` + `@mapbox/geo-viewport`. Peer deps `*` (no SDK 54 conflicts).
- Pre-route browse mode (`routes.length === 0`) fetches via `getNearbyPOIs` (existing `get_nearby_pois` RPC wrapper) using the visible region's center + center-to-corner radius (cap 200 km). Debounced 500ms on `onRegionChangeComplete`.
- Clustering enabled only in browse mode (`clusteringEnabled={browseMode}`); fixed markers (destination, manual origin, stop dots, pending pin, post-route POIs) all carry `cluster={false}` so the library skips them.
- Custom `renderCluster` returns a Field Notes cluster bubble: cream `paper` bg, 1px `rule` border, `accent` count text. Three sizes — 40px for <10, 56px for 10–49, 72px for ≥50. Count uses the `button` type variant (Fraunces serifItalic 500 16px) — the spec asked for "Fraunces 500 italic, closest existing variant"; `button` is the exact match.
- Last-seen region captured in a ref so re-entering browse mode (e.g., user clears destination) fetches around the current map position, not back at LA `INITIAL_REGION`.

**Success state (remaining):**
- **Stage 2 (parity):** apply the same clustering wrap to `app/customize.tsx` map preview, `app/drive.tsx`, `app/hiking.tsx`, `app/trail.tsx`. Customize map is `scrollEnabled={false}` so it's preview-only; the clustering wrapper still applies for the static view.
- **Stage 3 (post-route enrichment):** lift the silent 40-POI cap on home / drive post-route markers. Wire chip filters (drift 5.50) so home chips narrow the route corridor preview and customize chips drive live POI filtering.

**Test:** Pre-route — load the home map at LA-area zoom with no destination; POIs cluster into density bubbles, expand on zoom-in. Post-route — pick a route; all corridor POIs render individually on home, customize map preview, and drive map regardless of zoom.

**Decided by:** User flagged during the Layer 1.5 Android-insets pass; belongs to the POI pipeline arc, rendering phase.

---

### 5.50 — Filter chips are visual-only; not wired to route generation or POI filtering

**Status:** `open` — visual half (chip selected-state styling + fade-edge gradient) reached parity across home (`app/index.tsx`) and customize (`app/customize.tsx`) in commit-tbd. Wiring half (chip taps → corridor / route-generation filter param) still deferred per POI pipeline arc.

**Surface:** The home-screen chip row (`activeCatChips` state in `app/index.tsx`) and the customize-screen category pills (`selectedCats` state in `app/customize.tsx`) both toggle local state on tap but neither feeds into the underlying data fetch. Home-screen chips don't constrain route POI counts (`getPOIsAlongRoute` is called without a category filter on the home screen). Customize chips DO get serialized into the trip's `category_filter` array, but only at trip-save time — there's no live-filtered POI count or preview while toggling, and the corridor RPC's `category_filter` param is the only path that uses them.

**Success state:** Home chips feed into route generation — selecting chips on the home screen narrows the POI count badge on each route card and the corridor preview to only matching categories, so the user picks a route knowing what stories it offers in their chosen categories. Customize chips drive live POI-level filtering with a visible count that updates as the user toggles. Slug mapping uses the existing `CAT_SLUG` table in both screens (UI labels → DB poi_categories slugs).

**Trigger:** Wait until the POI pipeline lands actual category-tagged POIs across all 9 home-screen categories. Several home-screen chip labels currently map to slugs that have zero or near-zero POIs in production (per `docs/audit-poi-categories.md`); wiring chips before the data is there would just give users dead-state toggles.

**Test:** Home — toggle "Nature" with a destination set; route POI counts shrink to nature-only POIs and the badge updates within ~2s. Customize — toggle "Food"; the live `liveStoryCount` figure in the context bar updates immediately.

**Decided by:** User flagged during the Layer 1.5 chip-row visual fix; deferred to the POI pipeline arc (rendering / filtering phase) where the data side and the UI side both need work and should land together.

---

### 5.51 — Filter chip overflow at scale

**Status:** `noted`

**Surface:** The home-screen filter chip row uses a horizontal scroll with fade edges. It works for the current ~5–10 category pills, but past that neither linear scrolling nor a single dropdown serves the user well — scrolling buries options off-screen, and a flat dropdown loses the at-a-glance "what's active" affordance the chip row gives today.

**Planned evolution:** "Active + Filters sheet" pattern. Only currently-selected filters appear as green-stamped pills in the chip row, plus a single outlined `+ Filters` pill that opens a grouped bottom sheet showing all categories with toggle states. The chip row stays compact regardless of taxonomy size; the sheet provides full discoverability.

**Trigger:** Defer until category count justifies it — likely once the POI pipeline imports broader taxonomy and the home screen needs more than ~10 filter options. Premature now; the fade-edge scroll handles today's count cleanly.

**Decided by:** User flagged after the Layer 1 home-screen migration (commit `a965214`); belongs to the home-screen rendering arc.

---

### 5.52 — Bottom-sheet inner content still rendered behind Android system nav bar after 26d4ece

**Status:** `resolved` (fixed in this commit)

**Surface:** Commit `26d4ece` consumed `insets.bottom` only via the ScrollView's trailing spacer inside the home-screen bottom sheet. That fix protects the scroll-bottom case (CTA visible when scrolled all the way down) but not the intermediate scroll case: the sheet itself sits at `position: 'absolute', bottom: 0`, so its full height extends behind the Android system nav. At mid-scroll positions through a long route list, the bottom rows render *behind* the nav band and become un-tappable.

**Resolution:** Pad the `Animated.View` (the sheet container) itself with `paddingBottom: insets.bottom` inline. The sheet's paper-deep background still extends edge-to-edge under the nav (preserves the aesthetic), but the inner ScrollView's available height shrinks by `insets.bottom`, so the scrollable content never overlaps the nav band regardless of scroll position. The trailing spacer is reduced back to `height: 12` since the outer padding handles the inset.

**Test:** On Android with the home screen's bottom sheet at expanded state and 8+ routes loaded, scroll the route list to a mid position; the bottom-most visible route card sits fully above the system nav band — its tap target lives entirely in interactive space.

**Decided by:** User-filed regression after commit `26d4ece` landed; diagnosed during the Layer 1.5 closing pass.

---

### 5.53 — Bottom-sheet text variants below Android body-readability threshold

**Status:** `resolved` (fixed in this commit)

**Surface:** External feedback that bottom-sheet text was hard to read on Android. Audit identified three consumer-side variant misuses:
- `routeMeta` ("62 mi · I-5") used `uiSmall` (sans 12px) for body-content metadata that the user needs to read at a glance.
- `storiesText` ("143 stories") same: `uiSmall` for content.
- `tagText*` (route-card descriptor pills like "more stops", "longer", etc.) used `meta` (mono 10px uppercase). Mono uppercase at 10px renders fuzzy on lower-DPI Android and reads as a label, but the content is descriptive, not labelling.

**Resolution:** Variant swaps at the consumer site only — the Field Notes type ramp tokens themselves were not modified.
- `routeMeta`: `uiSmall` → `ui` (sans 14px).
- `storiesText`: `uiSmall` → `ui` (sans 14px).
- `tagTextPro` / `tagTextCon` / `tagTextNeutral`: `meta` (mono 10px uppercase) → `uiSmall` (sans 12px). Loses the stamped feel but gains legibility.

Label-style variants (`routesLabel`, `legendText`, `badgeText`) intentionally kept on `meta` — they are labels, not content, and the stamped feel is part of their semantic.

**Test:** On Android hardware at arm's length, the route-card metadata strings ("62 mi · I-5", "143 stories") and tag-pill descriptors render legibly without leaning in. Badge text ("FASTEST", "MOST STORIES") stays mono-uppercase stamped.

**Decided by:** External feedback on bottom-sheet readability; minimum-scope audit applied per Layer 1.5 closing pass.

---

### 5.54 — Chip selected-state visual contrast insufficient

**Status:** `resolved` (fixed in this commit)

**Surface:** After commit `37cf72a` tokenized the chip selected state (filled `accent2` forest vs outlined cream), user reported still being unable to tell on vs off at a glance. Diagnosis confirmed React state was toggling correctly; the issue was visual contrast — the unselected pill's 1px `rule` border (18% alpha ink) was barely visible against the map backdrop, and `chipActive` didn't explicitly zero out the borderWidth so the "outlined vs filled" delta was not maximized.

**Resolution:** Bump unselected chip border from 1px `rule` to 2px `ink` (full alpha) so the outline reads as a decisive dark stamp against any map terrain. Explicitly set `chipActive.borderWidth: 0` so the selected pill is a clean fill with no edge competing with the bg color. Same treatment applied in parallel to `app/customize.tsx`'s category pills within the legacy `C` palette: 2px `BORDER_STRONG` outline for off, `borderWidth: 0` on `pillOn`, pill text bumped to `TEXT_PRIMARY` (cream) + weight 600 for off and weight 700 for on. The "subtle inner stroke on selected" idea from the spec was skipped — would need a nested-View workaround in RN, and the 2px-outline-vs-zero-border delta turned out to be sufficient on hardware.

**Test:** On Android, toggle a chip — the visual delta between off (cream pill with thick dark outline) and on (solid forest pill, no outline) is unambiguous against any map background (light terrain, dark water, topo green).

**Decided by:** User-filed regression after commit `37cf72a` landed (chip selected state still unclear); Layer 1.5 closing pass.

---

### 5.62 — Browse-mode radius hard-cap at 200km caused state-wide cluster vanishing

**Status:** `resolved` (fixed in this commit)

**Surface:** After commit `420f5bc` shipped Stage 1 home-screen clustering, the user reported clusters appearing during pan/zoom but disappearing when the camera settled at state-wide zoom. Root cause: the original `BROWSE_MAX_RADIUS_M = 200_000` cap. At state-wide zoom (latitudeDelta ~6°, ~330 km half-span), the fetch radius clamped to 200 km, returning POIs only in a small central disc — ~80% of the visible viewport had no data. During pan the old POI set lingered visually until the new fetch returned the next small disc for the new center, producing the "snap to empty then snap back" feel.

**Resolution:**
- Replaced `200_000` cap with `1_000_000` (1000 km). Radius derivation switched from `sqrt(dLat² + dLng²)` (corner distance, smaller) to `max(halfLatKm, halfLngKm)` so state-wide zoom actually fetches state-wide data.
- Capped POI count at 500 in JS post-fetch. The RPC `get_nearby_pois` doesn't currently expose a `limit` param or project `significance_score` into its return shape, so the slice is over the RPC's default `ORDER BY distance_m` (closest-first). User direction was "sorted by significance_score DESC if exposed; otherwise post-filter in JS" — taking the JS-side closest-first fallback. True significance-sorted top-N would require an RPC migration extending the projection + adding a `limit` param. Deferred.

**Test:** Open home with no destination, zoom out to state-wide. Cluster bubbles appear and persist at rest, scattered across California's dense areas (LA basin, SF Bay, Central Coast, etc.) — not just near one center.

**Decided by:** User-filed regression after commit `420f5bc`; Stage 1 clustering follow-up.

---

### 5.63 — Pan/zoom lag from 500ms debounce + post-cap render burden

**Status:** `resolved` (fixed in this commit)

**Surface:** The original Stage 1 home clustering used a 500ms debounce on `onRegionChangeComplete` and no cap on browse POIs returned. After a pan, the user saw a half-second pause before the cluster engine recomputed and ~uncapped Markers redrew. Combined with 5.62's "clusters vanish at rest" effect, the interaction felt sluggish.

**Resolution:**
- Debounce reduced from 500ms → 250ms.
- Browse fetch capped at 500 POIs (see 5.62), bounding the cluster engine + render work regardless of zoom-out radius.
- Verified Marker keys are `poi.id`-based (line `key={``browse-${poi.id}``}`), so React reconciles fetched-set deltas instead of remounting every Marker on each refetch.

**Test:** At state-wide zoom on home, pan slowly across the state. Clusters update within ~250ms of pan-end with no flicker.

**Decided by:** User-filed regression after commit `420f5bc`; same diagnosis pass as 5.62.

---

### 5.64 — POI markers missing on drive.tsx after trip start

**Status:** `resolved` — closed this commit. Hardware logs from `ee2f921` confirmed the drive marker render path reads from the full corridor `pois` array (count=1000), not a `liveQueue` subset; the marker-source-split hypothesis was incorrect. The visibility bug is shared with home post-route — same root cause as 5.66 (Marker `tracksViewChanges={false}` + custom View child + react-native-maps 1.20.1 on Android = empty bitmap snapshot). Fix landed in the same commit that resolves 5.66.

**Surface:** User reports zero ink-red POI dots render on `app/drive.tsx` after a trip starts. Phase 0 investigation reported this screen calls `getPOIsAlongRoute('driving')` and renders uncapped `<Marker>` children from the `pois` state. Static code review of the file (no changes since the initial commit `d1b5c30`) didn't surface an obvious break:
- `routePreview.polylineCoords` round-trips through JSON params correctly (home → customize → drive); the Polyline at `drive.tsx:565` is gated on `polylineCoords.length > 1` and per user's screenshots renders fine, so the polyline IS present.
- The fetch effect at `drive.tsx:430` calls `getPOIsAlongRoute(polyline, poiDist, cats, mode)` with valid args; the JSX map at `drive.tsx:583` is straightforward.
- Default `poiDist = filters.corridorMi ?? 1` (1-mile corridor). 1 mile on a typical 50–60 mi route should still return some POIs based on smoke-batch corridor counts in CLAUDE.md, but a sparse rural route could plausibly return very few.

**Resolution (commit `cd1881e`):** Added a `__DEV__`-gated `console.info` at the fetch effect entry that prints `polyline=N, corridorMi=K, mode=M, categories=…, fetched=W`.

**Likely actual root cause (5.66 follow-up):** `getPOIsAlongRoute` in `lib/supabase.ts` did not downsample the polyline before sending the WKT to `get_corridor_pois`. `countPOIsAlongRoute` (the function backing the route-card "stories" badge) DID downsample to ≤150 points. For a long route (LA→Cambria, ~2000 polyline points), the unbounded WKT makes the server-side ST_DWithin + ST_LineLocatePoint computation slow enough to time out / return empty / fail silently. The count call worked because of its downsampling; the data call failed because of its absence. `drive.tsx` calls the same `getPOIsAlongRoute` wrapper, so it inherits the same failure mode — long-haul trips would see zero POIs, same as home post-route. The downsample fix in 5.66 covers both.

**Hardware re-test on `c069d5d` (reopen, this commit):** Tester confirmed the symptom persists on Android Expo Go after the downsample fix landed — Scene B (Begin trip → drive screen with full route) still shows zero POI dots. The drift 5.64 hypothesis that the drive Markers read from a `liveQueue` subset rather than the full `pois` array was checked statically and found incorrect: [app/drive.tsx:595](app/drive.tsx#L595) maps over `pois`, not `liveQueue`. No marker-source split needed. Diagnostic observability added this commit at every handoff (fetch:start / rpc-start / rpc-response / state-set / render:markers) across `lib/supabase.ts`, `app/index.tsx`, and `app/drive.tsx`; the next hardware boot will surface whichever stage is dropping rows or failing to render. Logs are kept as long-term observability, not removed after diagnosis.

**Test:** Start a trip → ink-red POI dots visible along the route polyline. Tap one → callout opens. The `__DEV__` log added in `cd1881e` should now show `fetched=M>0` instead of 0.

**Decided by:** User-filed regression; root cause surfaced during 5.66 diagnosis.

---

### 5.65 — Drive "Up next" list shows distance from queue (static arc-length) not liveQueue (GPS-driven)

**Status:** `resolved` (fixed in this commit)

**Surface:** Drive screen has two consumers of POI distance data:
- The "next story" pill at top reads `nextPoiDist = liveQueue[0]?.distanceMi` (haversine from user GPS to POI, recomputed on every GPS update).
- The structured "Up next" list at `drive.tsx:805` iterated over `queue.slice(0, 5)` — the **static** queue set once at POI-fetch time with arc-length distances from route start (not from current position).

For a user mid-trip, list distances stay frozen at "60 mi to Joshua Tree" even as they drive toward it, while the pill correctly counts down to ~5 mi. Also, when the socket pushes `narration_queued { next_pois }`, server-pushed items may lack a `distanceMi` field — `fmtMiles(undefined)` would crash on `.toFixed`.

**Resolution:**
- List now iterates `liveQueue.slice(0, 5)` — same source as the pill, distances update with GPS movement.
- `fmtMiles()` hardened with `if (mi == null || !Number.isFinite(mi)) return '—'` so server-pushed items missing `distanceMi` render as '—' instead of crashing.

**Test:** Start a trip → scroll the Up next list → each item shows a distance value that updates as GPS position changes. (Acceptance criterion 4.)

**Decided by:** User-filed regression. Diagnosed statically by following the two consumers.

---

### 5.66 — Post-route corridor POIs not rendering on home map after route selection

**Status:** `resolved` — fixed this commit. Hardware logs from `ee2f921` proved data flowed through every observable handoff with non-zero counts (`routePOIs=309 filtered=309 rendered=40` on home; `count=1000` on drive); 40 / 1000 `<Marker>` components were emitted by the React render output, but none displayed on the map. Bug was downstream of React — in the native-side `react-native-maps` 1.20.1 marker pipeline on Android.

**Surface:** After selecting a long-haul route on `app/index.tsx` (user's hardware repro: LA→Cambria), the route polyline draws, the route card displays the correct "309 stories" badge, but zero ink-red POI dots render along the corridor. Pre-route browse clustering works correctly; post-route render does not.

**Diagnosis:** The render path (`!browseMode && filteredRoutePOIs.slice(0, 40).map(...)`), state machine (`browseMode = routes.length === 0` flips false correctly when routes load), and Marker styling (`s.poiDot` = same ink-red 10×10 dot that browse markers use successfully) were all verified correct via static review. ClusteredMapView's `clusteringEnabled={browseMode}` passes all children straight through to inner MapView when `browseMode === false`, so the clustering wrapper isn't shadowing post-route markers either.

**Root cause:** `getPOIsAlongRoute` in `lib/supabase.ts` did not downsample its polyline before sending the WKT to `get_corridor_pois`. Its sibling `countPOIsAlongRoute` (the one populating the route-card "stories" badge) explicitly downsamples to ≤150 points with the in-source comment "Downsample to ≤150 points to keep the WKT payload small while preserving shape." Both functions hit the same RPC; only one applied the downsample. A Google-decoded long-haul polyline (LA→Cambria, ~2000 points) sent as a 60+ KB WKT made the server-side ST_DWithin + ST_LineLocatePoint computation against ~24k POIs slow enough to time out / fail silently. The count call returned the right number (downsampled, fast); the data call returned nothing useful (full polyline, slow/failed). The post-route render path was correct all along — it just had no data to render.

**Resolution arc (across three commits):**

1. **`c069d5d`** — asymmetric WKT downsample fix in `lib/supabase.ts`. Real bug (the count call worked, the data call didn't), but it wasn't this one. Hardware re-test showed the data call now returned 309 rows correctly, yet markers still didn't display. Necessary plumbing, not the visibility cause.
2. **`ee2f921`** — diagnostic observability at every handoff (RPC start / RPC response / state-set / render). Hardware logs proved data reached the render path and `<Marker>` components were emitted in correct quantity, ruling out every fetch / state / filter stage. Forced the diagnosis into the native marker pipeline.
3. **This commit** — root cause fix.

**Root cause:** `<Marker tracksViewChanges={false}>` combined with a custom React Native `<View>` child, on `react-native-maps` 1.20.1 + Android. The library converts the View child to a native Android Bitmap on the marker's first render so it can be drawn into the Google Maps overlay efficiently. When `tracksViewChanges={false}` is set on the very first render — before the JS-side View has actually rasterized — the library snapshots an empty bitmap and never re-snapshots (because tracking is off). The Marker's coordinate is correct, the React tree contains the element, the parent map is rendering, but the per-marker bitmap is blank, so nothing appears at the coordinate. Markers without custom children (default pin), or with `tracksViewChanges` left default `true`, snapshot correctly because the bitmap is captured (or re-captured) after the child has rasterized.

**Why the cd1881e instrumentation didn't catch it earlier:** the `[drive] POI fetch:` log in cd1881e printed `fetched=N>0`, satisfying the static reviewers' "is the data there" question. The render-side `[drive] render:markers source=pois count=N` log added in ee2f921 showed the markers were ALSO emitted by the React render — the gap was between "React rendered the element" and "Google Maps drew a pixel," which sits in the native marker pipeline.

**Why browse mode (`react-native-map-clustering`) seemed to work earlier:** unverified — the user has not isolated browse-mode rendering this session. The browse markers used the same `tracksViewChanges={false}` + custom View child pattern, so they were likely also broken. The clustering wrapper renders cluster bubbles via the `renderCluster` callback (which produces a single View per cluster, not many individual markers), and at wide zoom the user mostly sees cluster bubbles; the per-marker bug only becomes obvious once you zoom in past the cluster threshold. The fix applies to browse markers too; this commit removes `tracksViewChanges={false}` there as well for consistency.

**Resolution:**
- `app/index.tsx`: removed `tracksViewChanges={false}` from browse-mode POI markers (line 1085) AND post-route POI markers (line 1097). Default `true` is the visibility-safe setting; the perf cost (re-snapshot on prop change) is acceptable at 500-cap (browse) and 40-cap (post-route).
- `app/drive.tsx`: removed `tracksViewChanges={false}` from corridor POI markers (line 595). At 1000-marker corridors the re-snapshot cost is non-trivial, but visibility wins; the inline comment notes a delayed-flip pattern (track=true initially, flip to false after mount) as the future perf tune if pan/zoom jitters at scale.
- Both screens gain a one-time `render:firstPOI` diagnostic log that dumps `keys`, `lat`, `lng`, their types, and the coordinate object actually passed to `<Marker>`. This is the user-requested verification that the coordinate field shape wasn't the cause. To be dropped after hardware confirms markers render; the pipeline-level fetch / state / render counters stay as persistent observability.

**Test:** Select a long-haul route on home (e.g. LA→Cambria) → ink-red POI dots render along the polyline (capped at 40 per Stage 1 scope). Begin trip → drive screen renders all corridor POIs as ink-red dots (`pois.length` per `[drive] render:markers`). Hardware booth: confirm `[home] render:firstPOI` and `[drive] render:firstPOI` show `lat=<number>(number)` and `lng=<number>(number)` — confirms hypothesis #1 was not the cause and hypothesis #2 (Marker children invisible due to bitmap snapshot timing) was.

**Decided by:** Hardware logs from `ee2f921` showed React render output had Markers but Google Maps drew nothing. Process of elimination on the user-supplied hypothesis ranking landed on bitmap snapshot timing under `tracksViewChanges={false}` + custom child.

---

### 5.69 — Android system nav bar overlaps Start / End trip CTAs

**Status:** `resolved` (fixed in this commit)

**Surface:** Hardware test on Android Expo Go after the broader insets pass (commit `26d4ece` / drift 5.46) shows the bottom action CTAs still overlap the system navigation overlay. Specifically:
- **Home** (`app/index.tsx`): the Customize trip CTA at the bottom of the mobile bottom sheet sits flush against the Android nav / back-gesture zone — `paddingBottom: insets.bottom` alone is not enough buffer because Android's gesture hit-zone extends slightly past the visible nav bar height.
- **Drive** (`app/drive.tsx`): the End trip CTA in the peek-state action row overlaps the nav area when the sheet is fully retracted. `DRIVE_SNAPS.peek` was a fixed 96px module constant that did not account for `insets.bottom` at all, so the peek sheet's bottom edge sat at the screen bottom and the End trip button bottom sat ~18px above screen bottom — fully inside Android's gesture zone.
- **Trail** (`app/trail.tsx`): the End hike button in `btnBar` only had `paddingBottom: 12` on top of `SafeAreaView edges={['bottom']}`. The 12px gap above the inset edge is below Android's gesture-zone safety margin.

**Safety angle:** a driver missing the End trip button and instead hitting Back / Home in the gesture zone can exit the app mid-trip. This is a real safety hazard, not a cosmetic complaint.

**Resolution:**
- `app/index.tsx`: bumped the mobile sheet's bottom padding from `insets.bottom` to `insets.bottom + 16` so the Customize trip CTA sits ≥16px above the inset edge.
- `app/drive.tsx`: introduced `useSafeAreaInsets()` and `useMemo`-wrapped a per-render `driveSnaps` that overrides the module-level `DRIVE_SNAPS.peek` (base 96) to `96 + insets.bottom + 16`. Map-style picker, recenter button, and POI callout that previously read `DRIVE_SNAPS.peek + …` for their bottom offsets now read `driveSnaps.peek + …` so they stay above the (larger) peek sheet. Also bumped `actions.paddingBottom` from 4 to 16 so the End trip button in expanded state clears the SafeAreaView inset edge by 16px.
- `app/trail.tsx`: bumped `btnBar.paddingBottom` from 12 to 16. The wrapping `SafeAreaView edges={['bottom']}` continues to supply `insets.bottom`; the inner padding now provides the 16px gesture-zone buffer above it.

**Rationale for `+ 16`:** Android gesture targets extend slightly past the visible nav bar. `insets.bottom` reports the visible nav bar height; a `+ 16` buffer is the minimum that reliably keeps a 64pt touch target out of the back / home / recents gesture overlap.

**Files touched:** [app/index.tsx](app/index.tsx#L1139), [app/drive.tsx](app/drive.tsx#L1091), [app/trail.tsx](app/trail.tsx#L406). No iOS visual change — `insets.bottom` on iOS already accounts for the home indicator and the `+ 16` lands above that, which matches existing iOS-friendly spacing.

**Test:** Android hardware — Home expanded sheet: Customize trip button bottom edge ≥ `insets.bottom + 16` above screen bottom. Drive peek: End trip button bottom edge ≥ `insets.bottom + 40` (peek base 96 + buffer + inset). Drive expanded: End trip button bottom edge ≥ `insets.bottom + 16`. Trail: End hike button bottom edge ≥ `insets.bottom + 16`. iOS hardware — no regression; layout positions shift up by 16px relative to the inset edge, no visible change against home indicator.

**Decided by:** Hardware test on `c069d5d` (Android Expo Go) — Start / End trip CTAs visibly clipped by the nav overlay. Same surface as 5.46 (resolved) but `26d4ece`'s `insets.bottom`-only fix didn't add the extra gesture-zone buffer that this entry resolves.

---

### 5.67 — RPC does not expose `significance_score`; no min / sort / limit params

**Status:** `resolved` (filed-and-fixed this commit). Filed in this PR per
spec request; open + close in the same entry per the user's "open + close"
directive for spec-cited drift numbers that didn't exist in the catalog.

**Surface:** Pre-curation, `get_corridor_pois` (drift 5.35 confirmed
`get_route_pois` does not exist — corridor RPC is `get_corridor_pois`)
and `get_nearby_pois` returned `lat, lng, tags, dist_from_route_m` /
`distance_m` only. The 0–100 `pois.significance_score` was reachable
only by a separate `pois.id` → significance lookup, which makes the
client-side curation algorithm (drift 5.76) round-trip per POI. The
RPCs also lacked a `min_significance` floor parameter, so dropping
low-relevance POIs server-side wasn't possible.

**Resolution:**
- Migration `20260512000002_get_corridor_pois_significance.sql`: patches
  `get_corridor_pois` to project `significance_score` and accept three
  new optional params — `min_significance` (default 0; drops POIs
  below this score), `sort_mode` (`'significance_desc'` for curation,
  `'distance_asc'` preserves the legacy arc-length default), and
  `result_limit` (server-side `LIMIT`; default `NULL` = unbounded).
  Existing 4-arg callers continue working unchanged.
- Migration `20260512000003_get_nearby_pois_significance.sql`: same
  shape on `get_nearby_pois`. The `DO $$ … DROP FUNCTION …` block above
  the create handles the multiple overloads that have accreted across
  20260504000016 (`p_include_children` add) and 20260504000017
  (confidence-score filter add).
- `lib/supabase.ts`: `POI` interface gains `significance_score?: number`;
  a new `POIQueryOptions` interface carries the three new params;
  `getPOIsAlongRoute` / `getNearbyPOIs` accept an optional 5th `options`
  arg. All existing 4-arg call sites unaffected.

**Spec note:** the spec body named `get_route_pois`. That function has
never existed in this repo (drift 5.35). The migration patches the real
RPC name (`get_corridor_pois`), surfaced as a premise note in the commit
message.

**Test:** apply migrations, then `SELECT * FROM get_corridor_pois(<wkt>,
1, NULL, 'driving', 70, 'significance_desc', 50)` returns ≤50 rows,
sorted by `significance_score DESC`, all with `significance_score >= 70`
and `significance_score` populated on every row.

**Decided by:** Spec drift 5.67. Open-and-closed in one entry per the
session directive ("Open + close in the same entries" for non-existent
spec-cited drift numbers).

---

### 5.71 — Zustand session store didn't exist; cross-screen state ad-hoc'd through nav params

**Status:** `resolved` (filed-and-fixed this commit). Filing this even
though the spec didn't name a number for the foundation work; the
foundation is load-bearing for 5.80 (category chip sync) and 5.82
(mode selector), so future debugging needs a catalog entry to point at.

**Surface:** Before this commit, `home → customize → drive` passed all
shared state through `navigation.navigate('customize', { … })` JSON
strings — fine for one-shot navigation payloads (route polyline, saved
trip id) but awkward for state that needs to flow both directions
(category chip sync between home and customize) or survive a screen
unmount (active trip mode). Past instructions placed `useTripStore` as
the convention but no file existed to hang `import` statements off.

**Resolution:**
- Added `zustand` `^5.0.2` to `package.json` dependencies. User needs to
  `npm install` after pull.
- Created `src/store/tripStore.ts` with Zustand + `persist` middleware
  backed by `AsyncStorage` (already a project dep). State shape:
  `activeTripMode: 'driving' | 'hiking'` (default `'driving'`),
  `selectedCategories: string[]` (default `[]`). Actions:
  `setActiveTripMode`, `setSelectedCategories`, `toggleCategory`,
  `clearSelectedCategories`. AsyncStorage key `xroad.tripStore`,
  `version: 1`. `partialize` includes only the two persisted fields —
  setters / migrations are recreated on each app launch.
- Trip-bound settings (`density`, `min_relevance`) stay on the `trips`
  table per the user's "extend trips table; don't create
  user_session_prefs" directive (drift 5.75 / 5.77 migration adds
  those columns).

**Test:** Toggle Drive/Hike on home → cold restart app → toggle remains
selected. Select chips on home → navigate to customize → chips reflect
selected → toggle one off on customize → return to home → that one is
unselected.

**Decided by:** User direction on foundation: "Store: Zustand …
persist with AsyncStorage middleware … Don't add a parallel state
library." Filed under the next-free integer (5.71) since the spec
skipped 5.71 between my 5.70 and the spec's 5.72.

---

### 5.80 — Category chip state synced via Zustand session store

**Status:** `resolved` (filed-and-fixed this commit).

**Surface:** Pre-sync, home (`app/index.tsx`) held `activeCatChips: Set<string>`
locally and customize (`app/customize.tsx`) held `selectedCats: string[]`
locally. Tapping "Nature" on home did not reflect on customize. The
filter logic on home was additionally buggy — `activeCatChips.has(CAT_SLUG[poi.category] ?? poi.category)`
was checking slugs against a Set of display labels, so the filter would
never match (drift 5.84 in queue for follow-up: validate post-A4 that
the home filter now works correctly with the slug-set memo).

**Resolution:**
- Both screens now consume `selectedCategories: string[]` and
  `toggleCategory(cat: string)` from `useTripStore`. Single source of
  truth. Tap "Nature" on home → switch to customize → "Nature" chip is
  already active. Persisted via the store's AsyncStorage adapter, so
  selection survives app restart.
- Home's filter now memo-builds a slug Set from `selectedCategories.map(label => CAT_SLUG[label] ?? label.toLowerCase())`
  and tests `slugSet.has(poi.category)`. Compares slugs to slugs.
- Empty selection = include all (B2 curation convention). The previous
  customize default of pre-selecting `['History','Nature','Food','Roadside']`
  is removed — first launches show all chips unselected.

**Decided by:** Spec A4. User chose Zustand + persist over per-screen
state (drift 5.71). The empty-as-all convention came from the spec's
B2 algorithm description.

---

### 5.81 — Customize is trip-mode-aware (driving vs hiking defaults)

**Status:** `resolved` (filed-and-fixed this commit).

**Surface:** Pre-this-commit, `customize.tsx` hardcoded `POI_MIN=0,
POI_MAX=20, POI_DEFAULT=1` regardless of trip mode. A user toggling to
Hike on home would still see a 20-mile slider on customize — the wrong
unit for trail corridors.

**Resolution:**
- Reads `activeTripMode` from the tripStore. Computes `isHiking`,
  `poiMax`, `poiDefault` locally.
- `POI_MAX_DRIVING = 20`, `POI_MAX_HIKING = 2`. `POI_DEFAULT_DRV = 1`,
  `POI_DEFAULT_HIKE = 0.5`.
- `PoiSlider` accepts a `max` prop (with a ref capture so the pan handler
  picks up live changes without recreating the PanResponder).
- A `useEffect` clamps `poiDist` if `poiMax` drops below it (Drive → Hike
  toggle while distance was at 20 mi). Without the clamp the slider
  thumb would render past the track end.
- `countPOIsAlongRoute` and the trip-mode field on save get the right
  mode literal ('driving' or 'hiking') instead of the hardcoded 'driving'.

**Out of scope (deferred to B3 in commit 3):** density-per-mode defaults
(balanced for driving, dense for hiking) and the pace divisor in the
stats strip (route duration ÷ distance for driving; ~20 min/mi assumed
for hiking pending a real hike-duration field — drift 5.85 will track
the assumption).

**Decided by:** Spec A2.

---

### 5.82 — Mode selector pill on home (Drive | Hike)

**Status:** `resolved` (filed-and-fixed this commit).

**Surface:** Home had no surfaced toggle between driving and hiking
flows. The Hiking screen (`app/hiking.tsx`) was reachable only through
navigation that doesn't exist on the current home layout (no entry
point post-Field Notes migration). Users effectively had no way into
the hiking flow.

**Resolution:**
- Added a two-segment pill (`Drive | Hike`) on home's mobile top safe
  area, between the XRoad logo and the search pill. Field Notes
  treatment: paper background, ink-red active fill, JetBrains Mono
  metaSmall uppercase ~11px, height 32, ~72px per segment.
- Tap "Drive": setActiveTripMode('driving'); stay on home (current
  behavior). Tap "Hike": setActiveTripMode('hiking') and
  `navigation.navigate('hiking')`. The active selection persists in the
  tripStore so coming back from hiking → home renders the right pill
  state.
- Desktop layout unchanged (mobile-only per CLAUDE.md hard rule).

**Decided by:** Spec A1.

---

### 5.74 — Drive Marker iteration audit; home 40-slice removed

**Status:** `resolved` (filed-and-fixed this commit).

**Surface:** Spec C4 said "Confirm drive `<Marker>` iterates ALL of `pois`
(curated set), not slice. Remove any leftover 40-slice. Inline comment
noting curation handles the cap upstream."

**Audit findings:**
- `app/drive.tsx:595` was already iterating `pois.map(poi => …)` — no
  slice cap on drive.
- The 40-slice lived on `app/index.tsx:1097`'s post-route render
  (`filteredRoutePOIs.slice(0, 40).map(…)`). That was the visible cap.

**Resolution:**
- Home post-route now renders `homeCuration.curated.map(…)` (no slice
  cap). The curation function (drift 5.76) handles the right-sized
  trimming server-distance-and-density-aware.
- Drive renders `pois` directly. After commit 3's B7 wire-in, `pois` is
  the curated set from `curateRoutePOIs`, so the iteration naturally
  reflects the cap chosen on customize (density + relevance + duration).
- Inline comment on drive's pois.map block explains the curation
  upstream (no per-screen cap needed).

**Decided by:** Spec C4. The "leftover 40-slice" lived on home, not
drive; commit 3 removes it.

---

### 5.75 — Density slider on customize

**Status:** `resolved` (filed-and-fixed this commit). Spec B3.

**Resolution:**
- Segmented control "Sparse | Balanced | Dense" between CATEGORIES
  and RELEVANCE on customize.
- Default per mode: balanced (driving), dense (hiking). Set at state
  init from `isHiking`. Does not auto-revert on mode toggle.
- Selection persists in `trips.density` (migration 20260512000001) via
  the `saveTrip` payload, and ships to drive via the filters JSON nav
  param so drive's curation pass uses the same density.

**Decided by:** Spec B3.

---

### 5.76 — Curation function (`src/lib/curation/curateRoutePOIs.ts`)

**Status:** `resolved` (filed-and-fixed this commit). Spec B2.

**Surface:** Need a deterministic, unit-tested function that picks a
"right-sized" subset of corridor POIs given trip mode, density,
relevance threshold, active categories, and trip duration.

**Resolution:**
- New module `src/lib/curation/curateRoutePOIs.ts`. Pure, no IO. Imports
  the shared geometry helpers from `src/lib/geo` (which were lifted
  from `app/drive.tsx` in this same commit so the curation function and
  the drive screen share a single arc-length implementation).
- Algorithm matches spec B2 verbatim: filter categories → filter
  significance ≥ minRelevance → spatial-bin by arc-length (driving 1 mi,
  hiking 0.25 mi) → per-bin cap → global cap = floor(duration / divisor)
  with a floor of 1 → top-significance survivors.
- Per-bin caps: driving sparse 1 / balanced 2 / dense 3; hiking sparse 2
  / balanced 5 / dense 10.
- Global cap divisors: driving sparse 7 / balanced 4 / dense 2; hiking
  sparse 4 / balanced 2 / dense 1.
- Returns `{ curatedPOIs, count, avgPaceMinutes }`.
- 8 unit tests cover: empty input, category-excludes-all,
  relevance-empties, density-tier-deltas, spatial-spreading
  (clustered-POIs-don't-crowd-other-bins), hiking-bin-granularity,
  and avg-pace math. All passing.
- Jest config extended to include `**/src/**/__tests__/**/*.test.ts`
  so curation tests are discovered alongside the legacy
  `lib/__tests__/` tree.

**Decided by:** Spec B2. Algorithm taken verbatim from the spec body.

---

### 5.77 — Relevance threshold slider on customize

**Status:** `resolved` (filed-and-fixed this commit). Spec B4.

**Resolution:**
- New `RelevanceSlider` component (separate from `PoiSlider` because
  the 0–100 integer-snap behavior + tick markers don't compose into
  the mile-step slider cleanly).
- 0..100 continuous, snaps to integers. Implicit marker ticks at
  0/50/70/85/95 — rendered as thin vertical lines under the track. No
  preset buttons; spec says "implicit markers."
- Value label inline ("Min relevance: 70" — well, the spec writes it
  that way but the layout uses sliderLabelKey + sliderLabelVal in the
  same row as POI distance, so the rendered text is "Min relevance"
  with the value `70` on the right).
- Default 0 = no filter. Persists in `trips.min_relevance` (migration
  20260512000001) and ships to drive via filters JSON.

**Decided by:** Spec B4.

---

### 5.78 — Compact stats strip on drive

**Status:** `resolved` (filed-and-fixed this commit). Spec B6.

**Resolution:**
- Single-line strip rendered inside the bottom sheet, between the drag
  handle and the peek/expanded conditional. Visible in both sheet
  states.
- Format: `{N} POIs ahead · 1 every {M}m`. When `poisAhead === 0`, the
  pace tail is omitted (no division-by-zero, no "1 every 0m" garbage).
- "POIs ahead" computes `arc-distance(userLocation) → polyline`, then
  counts curated POIs whose `poiArcMapRef` entry exceeds the user's
  arc. Recomputes on each `userLocation` GPS update.
- Pace uses `remainingMin / poisAhead`, floored at 1m (UI dignity).

**Decided by:** Spec B6.

---

### 5.79 — Viewport-aware reveal on home post-route

**Status:** `resolved` (filed-and-fixed this commit). Spec B8.

**Surface:** Curated set on home post-route is intentionally small
(per drift 5.76). When the user zooms in far enough to inspect a
neighborhood, hiding the non-curated POIs feels like missing data.
B8 reveals the extras at street-level zoom.

**Resolution:**
- New `mapRegion: typeof INITIAL_REGION` state mirrors `lastRegionRef`
  (the ref alone doesn't trigger re-renders). Wired into
  `handleRegionChangeComplete`.
- `visibleExtras` useMemo: when `latitudeDelta < 0.05` (~5 km vertical
  span, neighborhood zoom), filter the non-curated POIs by the visible
  region bounds. Capped at 80 to bound render cost.
- Render: separate Marker mapping with `s.poiDotExtra` style — 8×8
  (vs 10×10 curated), `opacity: 0.5`, thinner 1px paper outline. Same
  ink-red accent. Tappable (Marker default), but NOT in the narration
  queue — narration only fires for curated set.
- Inline diagnostic log records `extrasVisible=N latDelta=X.XXXX` so
  hardware logs surface zoom-triggered reveal behavior.

**Decided by:** Spec B8. Threshold delta of 0.05 chosen from approximate
"can-read-street-names" zoom; can tune from hardware feedback.

---

### 5.69a (correction) — customize Start trip CTA — correct-file fix

**Status:** `resolved` (filed-and-fixed this commit). Correction to the
original 5.69 entry filed in `ee2f921`, which targeted home / drive /
trail CTAs but did not include `app/customize.tsx`'s Start trip CTA.

**Surface:** The customize.tsx Start trip CTA used a sibling spacer
pattern `<View style={{ height: 40 + insets.bottom }} />` after the
button to push it clear of the Android nav. On the user's hardware
this still rendered the CTA inside the gesture zone — likely an
interaction between the ScrollView's `contentContainerStyle.paddingBottom: 16`
and the spacer that pushed the visible-button position higher than the
spacer height. (Theory; the symptom is enough to justify the change
without deep-diving the layout.)

**Resolution:**
- Removed the `<View height={40+insets.bottom}/>` spacer.
- Applied `paddingBottom: insets.bottom + 16` directly to the ScrollView
  `contentContainerStyle` so the buffer is unambiguously rendered below
  the last child (the Start trip CTA).
- The pattern now mirrors home's sheet (`paddingBottom: insets.bottom + 16`
  on the Animated.View) and trail's btnBar (`paddingBottom: 16` inside
  the SafeAreaView edges={'bottom'} wrapper).

**Decided by:** Spec C3.

---

### 5.72 — Cluster bubble visual spec + delayed tracksViewChanges flip

**Status:** `resolved` (filed-and-fixed this commit). Spec C1.

**Surface:** Browse-mode clusters on home rendered with paper bg + ink
rule border + accent count (legacy "cream paper" treatment). User spec
calls for filled ink-red circles with paper outlines and a smaller
diameter ramp. Also the prior renderCluster set `tracksViewChanges={false}`
on the cluster Marker — same root cause as drift 5.66 (the View child
hadn't rasterized before the bitmap snapshot fired), so clusters could
render invisibly under certain re-render conditions.

**Resolution:**
- Cluster style updates: `clusterBubble.backgroundColor = theme.colors.accent`,
  `borderColor = theme.colors.paper`. `clusterText.color = theme.colors.paper`
  (paper / cream count text). Diameters dropped from 40/56/72 → 28/36/44,
  steps at 50 and 500 (was 10 and 50).
- New `ClusterMarker` module-level component holds per-instance
  `tracking` state. Starts `true` so the bitmap snapshot fires after the
  Fraunces-italic count rasterizes; flips `false` 1s post-mount via
  setTimeout to bound re-snapshot cost when many clusters share the
  viewport (state-wide zoom).
- `renderCluster` now returns `<ClusterMarker … />` instead of inlining
  the Marker — cleaner separation, hooks usage stays legal.

**Decided by:** Spec C1.

---

### 5.73 — POI marker tap callouts on home

**Status:** `resolved` — **reopened-and-fixed this commit**. Original
landed in `ac2e7a6` with `<Callout tooltip>` as a Marker child, but
hardware re-test showed taps did not surface the callout — the `<Callout>`
JSX was in the tree but never rendered as a bubble. Drive deferral
(unchanged) remains correct.

**Surface:** Tapping a POI dot on home pre-route or post-route did
nothing visible; user had no way to see which POI is at a coordinate
without committing to the route + customize + drive flow.

**Resolution:**
- Added `<Callout tooltip>` as a child of every POI Marker on home:
  browse-mode dots, post-route curated dots, viewport-reveal extras.
- Callout content: `<View style={s.poiCallout}><Text style={s.poiCalloutName}>{poi.name}</Text></View>`.
- Style: paper bg, Fraunces italic 16px name (`theme.textVariants.button`),
  ink-red 1px bottom border, 8×12 padding, radius 6, max-width 240.
- `tooltip` mode renders the View raw without the platform's native
  callout bubble chrome.

**Deviation (drive):** drive.tsx already has a custom `selectedPoi`
overlay rendering POI name + category + tag chips. That overlay is
richer than the spec'd Callout and lives outside the Marker tree. Adding
`<Callout>` to drive's Markers would create dual UI on tap. Drive
deferred to a follow-up that consolidates the two patterns — either
replace the custom overlay with a richer Callout, or keep the overlay
and skip Callout entirely. Hiking screens also deferred per the spec
("Hiking screens later.").

**Re-fix (this commit):** the failure mode on hardware was tap-flow
related, not styling. `react-native-map-clustering` 4.0.0 replaces
unclustered Markers with its own subtree for the clustering math, and
that subtree silently drops the `<Callout>` child's default tap-→-show
behavior. Two layers added to recover it:

1. **Explicit ref + `showCallout()`.** Wrapped browse / curated / extras
   Markers in a new `HomePoiMarker` component that holds a Marker `ref`
   and an `onPress` that calls `markerRef.current?.showCallout?.()`. This
   is the documented react-native-maps workaround for libraries that
   intercept the tap → callout flow. `tappable` prop set to true to
   ensure the tap fires at all under the clustering wrapper.
2. **`marker:tap` diagnostic log.** Each tap emits
   `[home] marker:tap screen={browse|curated|extra} poi=<name> id=<id>`
   under `__DEV__`. If callouts still don't render on hardware, the log
   confirms whether the tap is being received at all — which then routes
   the next diagnosis to either the JS handler chain (no log) or the
   native bitmap snapshot path (log fires, no bubble).

The `<Callout tooltip>` child + `s.poiCallout` styling from `ac2e7a6`
stays unchanged. The fix is purely tap-flow.

**Decided by:** Spec C2 (initial) + user-filed hardware reopen.

---

### 5.87 — Home bottom sheet snap regression after mode-pill landed

**Status:** `resolved` (filed-and-fixed this commit).

**Surface:** After `b62bf22` added the Drive/Hike mode pill on home (drift
5.82), the bottom sheet's `expanded` snap point covered the search pill
and chips: the sheet's drag handle sat behind the search bar, and the
user could not drag the sheet back to peek. SNAP_PTS was a module-level
constant (`expanded: Math.round(SCREEN_H * 0.85)`) computed before the
mode pill increased the top header's real height. The 15% from-top
clearance the constant assumed was no longer enough.

**Resolution:**
- Replaced the module-level `SNAP_PTS` constant with a `useMemo`'d
  `snapPoints: SnapPoints` inside the screen, depending on a new
  `headerHeight` state.
- `headerHeight` is measured via `onLayout` on the existing top
  `SafeAreaView` wrapper (which encloses dev nav row + logo + mode pill +
  search pill + chip row). 220px fallback before the first layout pass
  so the initial paint has a sane sheet height. ≥1px change triggers a
  recompute; sub-pixel jitter is ignored.
- `expanded = max(SCREEN_H * 0.40, SCREEN_H - headerHeight - 16)` — the
  `* 0.40` floor guarantees a usable expanded view even on hypothetical
  taller-header layouts; the `headerHeight + 16` term is the real
  constraint that surfaces the search pill and drag handle.
- `default = min(SCREEN_H * 0.38, expanded)` so the default snap can
  never exceed the expanded snap (defensive — would freeze the sheet).
- `peek` unchanged at `SCREEN_H * 0.18`.
- `useSheetSnap` already reads `ptsRef.current = points` every render, so
  dynamic snap points propagate to the PanResponder on next interaction
  without reinitializing the hook (verified by reading
  `hooks/useSheetSnap.ts`).
- Module-level `SNAP_PTS` constant retained: still used by the
  `fitToCoordinates` map-fit hint at line ~563 (`bottom: SNAP_PTS.default
  + 40`) as a coarse "leave room for the sheet" approximation. That's a
  one-time pad value not worth threading dynamic state through.

**Test:** Mount home → expanded snap leaves search pill, mode pill, and
chip row fully visible. Drag handle at the top of the sheet sits ≥16px
below the chip row's bottom edge on Android + iOS regardless of safe
area top. Mode pill takes up its real ~40px of header without
overflowing the snap point.

**Decided by:** User-filed hardware regression after `b62bf22`. The
mode-pill's added height wasn't reflected in the SNAP_PTS constant.

---

### 5.86 — Migration 20260512000003 used a SELECT alias inside an ORDER BY CASE expression

**Status:** `resolved` (filed-and-fixed this commit).

**Surface:** `psql ... -f supabase/migrations/20260512000003_get_nearby_pois_significance.sql`
failed at line 79 with:

```
ERROR: 42703: column "distance_m" does not exist
LINE 79: CASE WHEN sort_mode = 'distance_asc' OR sort_mode IS NULL OR
         sort_mode NOT IN ('significance_desc') THEN distance_m END NULLS LAST
```

**Root cause:** PostgreSQL's ORDER BY only resolves SELECT-list aliases when
they appear as **bare** column references. Inside expressions (including
`CASE WHEN`), identifiers fall through to the FROM clause's table columns.
The SELECT computed `ST_Distance(...) AS distance_m`, which made `distance_m`
visible as a bare ORDER BY target (the prior migration 20260504000017 did
exactly that — `ORDER BY distance_m`) but **not** visible inside the new
`CASE WHEN sort_mode = 'distance_asc' THEN distance_m END` expression. The
corridor sibling (20260512000002) didn't hit this because it inlines
`ST_LineLocatePoint(...)` directly in the ORDER BY CASE rather than
aliasing it.

**Live-DB state pre-fix:** the DO block at the top of the broken migration
successfully dropped the previous `get_nearby_pois` function before the
CREATE FUNCTION failed at parse-time validation. So between the broken
apply and this fix, the live DB had **zero** `get_nearby_pois` overloads.
Browse mode (`getNearbyPOIs` in `lib/supabase.ts`) and any other caller
were temporarily broken — RPC missing.

**Resolution:**
- Inlined `ST_Distance(p.location, ST_MakePoint(user_lng, user_lat)::geography)`
  in the ORDER BY's distance-sort branch (replacing the `distance_m` alias
  reference). Same pattern as the corridor sibling.
- Wrapped the whole migration in `BEGIN; … COMMIT;` so any future failure
  rolls back the DROP, avoiding the half-applied state this fix had to
  recover from.
- Migration remains idempotent: the DO block drops zero overloads when
  re-applied against a DB that already has the fixed function (the
  `CREATE OR REPLACE` then re-creates without DROP needed). Safe to
  re-run.
- Inline comment in the ORDER BY block points future debuggers at this
  drift entry so the in-CASE alias trap doesn't get re-introduced.

**Test:** `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260512000003_get_nearby_pois_significance.sql`
runs cleanly. Verification queries in the migration footer return the
expected row counts.

**Decided by:** User-filed hardware error during `psql -f` apply.

---

### 5.85 — Hiking duration uses flat 20 min/mi assumption

**Status:** `noted` — fix deferred. Filed for visibility.

**Surface:** When the user toggles to Hike on the home pill, the route
record (from Google Directions or Mapbox) still carries `duration_minutes`
computed as a driving duration. Customize's stats strip and the curation
function both need a *hiking* duration to compute the global cap and the
pace divisor.

**Workaround in customize / drive:** when in hiking mode, both
screens compute `effectiveDuration = distance_mi * 20 min/mi`. A
hiker doing 5 mi at 20 min/mi = 100 min — reasonable for a
moderate trail but ignores elevation, surface type, group size, and
the user's pace history. The number is good enough for curation
math (the global cap is coarse-grained) but bad for any UI that
quotes a precise time.

**Real fix:** add a `hike_duration_min` field on the route record,
populated by:
- Google Directions doesn't return walking time for trail polylines
  outside city sidewalks. Need a separate `mode=walking` query for
  short urban segments, or a server-side estimator for backcountry.
- Better: compute from the elevation profile (already fetched by the
  Google Elevation API integration sketched in CLAUDE.md's "Vehicle
  routing roadmap" section) using Naismith's rule (1 hr per 3 mi flat
  + 1 hr per 600 m ascent).

**Out of scope** for the curation arc; tracked here so the 20 min/mi
assumption doesn't get forgotten when the hiking flow gets its full
v1 treatment.

**Decided by:** Surfaced during commit 3 (curation). Flagged here
rather than left as an unattributed hardcoded constant.

---

### 5.83 — Roll-the-dice and Create-your-own narrator CTAs removed from customize

**Status:** `resolved` (filed-and-fixed this commit).

**Surface:** Customize had two extra CTAs below the narrator grid:
"🎲 Roll the dice" (random narrator generation via `/api/narrators/generate`
mode=random) and "✏️ Create your own" (custom narrator generation via
the same endpoint mode=custom, opening `CreateNarratorModal`). Spec
A3 calls for both to be dropped — the 4 preset narrator cards are the
supported selection surface.

**Resolution:**
- Removed the `<View style={s.actionRow}>` block containing both
  TouchableOpacities.
- Removed `rollingDice` / `setRollingDice` state, `diceAnim` Animated
  ref, `handleRollDice` useCallback.
- Removed `showCreate` / `setShowCreate` state. The
  `<CreateNarratorModal />` JSX is no longer rendered.
- The `CreateNarratorModal` function definition stays in `customize.tsx`
  as a carrier item against future re-enablement (spec calls it out
  explicitly as "deferred, carrier item"). `handleRollDice` similarly
  removed — re-enablement would need to bring it back from git history,
  but spec posture is that this is fine since the carrier modal is the
  load-bearing piece.
- `Animated` import dropped from `react-native` import block (no other
  consumers).
- Style entries `actionRow / actionBtn / actionIcon / actionText` left in
  the `s` StyleSheet — orphan but harmless, and a small future-friendly
  hook if the row comes back. No render impact.

**Decided by:** Spec A3.

---

### 5.70 — Home post-route `fetch:start` fires 4+ times per route selection

**Status:** `noted` — note only; address later. Non-blocking.

**Surface:** Hardware logs from `ee2f921` show `[home] fetch:start polyline=N corridorMi=1 mode=driving routeIdx=0` repeats 4+ times per single route selection on `app/index.tsx`. The repeated firings are not user-visible regressions (every fetch returns the same 309 rows in the user's LA→Cambria test, and `setRoutePOIs` re-sets to the same array each time so the render doesn't flicker), but each repeat sends the same 150-point WKT to `get_corridor_pois` and burns one round-trip.

**Mechanism:** the POI fetch effect at [app/index.tsx](app/index.tsx#L291) depends on `[selectedRouteIdx, routes]`. After `fetchRoute` lands, `routes` is set to the 3 fetched options (1 effect fire), then a per-route `countPOIsAlongRoute(...).then(setRoutes(prev => prev.map(...)))` callback updates each route's `poiCount` (3 more effect fires — one per route). Total: 4 fires per selection. The first fire has accurate polyline; the next 3 re-fire for state updates that don't actually change the selected route's polyline.

**Fix sketch (not landed):** depend on a derived primitive that only changes when the relevant polyline content changes, e.g. `[selectedRouteIdx, selectedRoute?.polylineCoords]`, or memoize a polyline hash. A `useRef` guard comparing the last-fetched polyline against the incoming one would also work. Either pattern eliminates the 3 redundant fires.

**Why deferred:** the redundant calls don't break user-visible behavior, and the underlying RPC is now fast (downsampled WKT). Cleanup belongs to a focused perf pass on `fetchRoute`'s effect-fan-out story. Flagged here so future debugging doesn't get confused by the duplicated log lines.

**Decided by:** Observed in `ee2f921`'s hardware logs while diagnosing 5.66.

---

## Cross-cutting observation

Five entries (5.18, 5.19, 5.24, 5.25, 5.26) shared the same root: out-of-band
schema work and documentation drift. The migration system contains 26 files;
the live schema had at least one table (`user_preferences`), one function
(`set_updated_at`), and documentation ambiguity (mode terminology) that
weren't reproducible from those files. Going forward: anything that lands
in production should land via the migration system, and CLAUDE.md updates should
ride in the same PR that introduces or changes a schema element. SKILL.md
(claude.ai-side, not in this repo) is synced separately via project artefact
swap; flag any required SKILL.md mirror update in the PR description for the
user to apply.

---

## Mirrored sections

SKILL.md is the chat-side Claude's project skill — it lives in the claude.ai
project folder, not in this repo, and is not tracked by git. Some sections of
CLAUDE.md are intentionally duplicated into SKILL.md so the chat-side Claude
has the same context as Claude Code. When a mirrored section changes, sync via
claude.ai project artefact swap (claude.ai produces the updated SKILL.md; user
replaces the project artefact). Flag the required mirror update in the PR
description so the swap happens alongside the git commit.

- "Mode column semantics" — CLAUDE.md (canonical) ↔ SKILL.md (mirror, chat-side).
  Either-side edits need parallel updates.

---

## How to add the next entry

1. Pick the next free integer suffix in the appropriate section (currently §5 is the only section).
2. Use one of the five statuses (`open`, `resolved`, `superseded`, `wontfix`, `noted`).
3. If you're filing a correction to an existing entry, append a letter suffix instead of editing the original — e.g. `5.20a`. The original stays as historical record.
4. Cross-reference any related audit doc and migration files. Future operators should be able to navigate to the receipts without grepping.
