# Audit — `narration_audio.na_unique` constraint shape (Track A / 5.26)

**Status:** implemented 2026-05-11 (Prompt 07). See drift catalog 5.26 / 5.33.

> **Corrigendum (2026-05-11):** Original inspection used `pg_indexes` only;
> live shape is constraint-backed (see drift 5.33).

**Date:** 2026-05-10
**Question:** Should `narration_audio.na_unique` include `mode` (trip_mode) alongside `(poi_id, narrator_slug, depth)`?
**Decision:** **Outcome A — add `mode` to `na_unique`**. Migration written but **STAGED, not applied** (breaks existing upsert call sites until they're updated to match).

---

## A1 — Data inspection (live DB)

```sql
-- Q1: cache distribution
SELECT mode, depth, narrator_slug, count(*) FROM narration_audio
GROUP BY mode, depth, narrator_slug ORDER BY count(*) DESC;
```
| mode    | depth     | narrator_slug           | count |
|---------|-----------|-------------------------|-------|
| driving | deep_dive | en-US-Chirp3-HD-Iapetus | 37    |

```sql
-- Q2: any (poi_id, narrator_slug, depth) tuples spanning multiple modes?
SELECT poi_id, narrator_slug, depth, count(*), array_agg(mode)
FROM narration_audio
GROUP BY poi_id, narrator_slug, depth HAVING count(*) > 1;
```
**Result: 0 rows.** No conflict. Adding `mode` to the unique constraint does not require any data cleanup.

```sql
-- Q3: current na_unique definition
SELECT indexdef FROM pg_indexes WHERE indexname = 'na_unique';
```
`CREATE UNIQUE INDEX na_unique ON public.narration_audio USING btree (poi_id, narrator_slug, depth)`

```sql
-- Q4: status counts
SELECT status, count(*) FROM narration_audio GROUP BY status;
```
| status | count |
|--------|-------|
| ready  | 37    |

```sql
-- Q6: distinct mode values present
SELECT DISTINCT mode FROM narration_audio;
```
Only `driving`. The CHECK constraint allows `driving | hiking | city`. `venue_tour` is not yet in the CHECK list.

**Bonus finding:** the supposedly-staged migration `20260510000003_narration_audio_index.sql` is in fact **already applied** — `idx_narration_audio_lookup ON (poi_id, mode, depth, narrator_slug)` exists live. CLAUDE.md's "staged but not applied" note for that migration is stale; should be moved to the applied list. (Out of scope to update CLAUDE.md from this PR.)

---

## A2 — Prompt template inspection

Two narration prompt construction paths exist:

### Wired (production today)
- [server/routes/narration.js:66-114](server/routes/narration.js#L66-L114) — `generateNarrationText({ poi_name, poi_category, poi_tags, depth })`
- [scripts/precache-popular-routes.ts:168-203](scripts/precache-popular-routes.ts#L168-L203) — `generateText(poi, depth)` (duplicated copy)

**Neither takes `mode` as a Claude input.** The user prompt hardcodes "Narrate this point of interest for a driver" / "Speak directly to the driver in present tense" — driving framing regardless of `narration_audio.mode`. Mode is in the Storage path (`{poi_id}/{mode}/{depth}/{voiceId}.opus`) and the JSON cache key (`{mode}-{depth}-{voiceId}`), but **content does not currently differ across `driving`/`hiking`/`city`** for the same POI + depth + voice.

### Unwired (richer engine, dead in production)
- [server/narration-engine.js](server/narration-engine.js) — composable engine
- Takes `narrator`, `depth`, `corridor_mode` (boolean). Also does **not** branch on `trip_mode` directly; it has `corridor_mode` distinguishing POI vs filler narration but no `driving`/`hiking`/`city` switch.
- No callers.

### Planned (venue-tour-design.md Section 6.3)
This is the deciding factor. The venue-tour design explicitly schedules **separate prompt templates per (mode, depth, audience)** for the new `venue_tour` mode:

> Two new prompt templates per (mode, depth, audience): `venue_tour_glance`, `venue_tour_ride_along`, `venue_tour_deep_dive`. The audience modes (Family, Kids, Unfiltered, Local) layer on top.
> This adds 12 templates (4 audiences × 3 depths) to the existing 12, for 24 total.

And the worked example demonstrates that the *content* genuinely diverges:

> **Driving narration of a parent:** "On your right, Disneyland Resort — opened in 1955 by Walt Disney as the original Magic Kingdom..."
>
> **Venue Tour narration of a child:** "You're approaching Big Thunder Mountain Railroad. This 1979 attraction was inspired by..."

So when V3 lands and `venue_tour` becomes a 4th value for `narration_audio.mode`, the same `(poi_id, narrator_slug, depth)` will legitimately resolve to **two distinct audio files** with different text.

---

## A3 — Decision: Outcome A

**Reasoning:**

1. **Future content divergence is committed in design.** venue-tour-design.md §6.3 plans `venue_tour` as a 4th `mode` value with intentionally different prompts. Locking the unique key to ignore `mode` would force one of two bad outcomes when V3 ships: either the `venue_tour` audio overwrites the `driving` audio for a venue-eligible POI on upsert, or V3 has to reshape the constraint anyway.
2. **Storage path and cache key already include `mode`.** Audio bytes live at `{poi_id}/{mode}/{depth}/{voiceId}.opus` — one Storage object per (poi, mode, depth, voice). The `narration_audio` row should mirror that addressability.
3. **No data conflict to resolve.** Q2 returns 0 rows.
4. **Existing wider lookup index already includes `mode`.** `idx_narration_audio_lookup ON (poi_id, mode, depth, narrator_slug)` (migration 20260510000003) — the read path already treats `mode` as part of the identity tuple. Only the unique constraint is out of step.

**Migration written:** [supabase/migrations/20260510000005_na_unique_add_mode.sql](supabase/migrations/20260510000005_na_unique_add_mode.sql).

---

## ⚠️ Coordinated code change required before applying

**Do not apply this migration in isolation.** Two upsert call sites currently use `onConflict: 'poi_id,narrator_slug,depth'`. PostgreSQL requires the `ON CONFLICT` target to match an actual unique constraint. After the migration the only matching unique constraint is the new 4-column one. The existing upsert call sites will fail at runtime with `ON CONFLICT DO UPDATE specification (...) does not match any unique or exclusion constraint`.

Before applying:

1. **[server/routes/narration.js:181-203](server/routes/narration.js#L181-L203)** — change `onConflict: 'poi_id,narrator_slug,depth'` → `'poi_id,narrator_slug,depth,mode'`.
2. **[scripts/precache-popular-routes.ts:223-249](scripts/precache-popular-routes.ts#L223-L249)** — same change to the `upsertNarrationAudio()` call.

These are deliberately **not** changed in this PR — the prompt scope explicitly says "do not modify TTS provider code or the narration generation pipeline beyond reading it." They should be done together with the migration apply step in a follow-up PR.

When `venue_tour` mode is ready to write its first row, the CHECK constraint on `narration_audio.mode` also needs `venue_tour` added; that's a separate venue-tour V3 migration, not this one.

---

## Follow-up tasks

- [ ] Update `onConflict` clauses in [server/routes/narration.js:196](server/routes/narration.js#L196) and [scripts/precache-popular-routes.ts:244](scripts/precache-popular-routes.ts#L244) to `'poi_id,narrator_slug,depth,mode'`.
- [ ] Apply migration `20260510000005_na_unique_add_mode.sql`.
- [ ] Update CLAUDE.md migration backlog: move `20260510000003_narration_audio_index` from "Staged but not applied" to "Applied" (it's already live).
- [ ] When venue-tour V3 starts writing audio: add `venue_tour` to `narration_audio.mode` CHECK constraint in a separate migration.
