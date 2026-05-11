# Audit — "mode" terminology disambiguation in CLAUDE.md

**Date:** 2026-05-10
**Resolves:** drift catalog entry [5.18](drift-catalog.md).
**Scope:** CLAUDE.md only. SKILL.md is referenced by the prompt and the catalog but does not exist on disk; user explicitly chose "skip SKILL.md" via AskUserQuestion. The dimensional-model table that the prompt scoped for SKILL.md was instead absorbed into CLAUDE.md's existing "Mode column semantics" section.

---

## Step 1 — Inventory

ripgrep `mode` (case-insensitive) against [CLAUDE.md](../CLAUDE.md) returned ~50 matches. Classified below; only AUDIENCE/TRIP/COMPOUND rows produce edits.

| line | excerpt (truncated) | classification | action |
|------|---------------------|----------------|--------|
| 23   | `(mode='hiking')` in screen-route note | LITERAL (code arg value) | LEAVE |
| 58   | "**Mode column semantics**" (section header) | COMPOUND (heading; intentional shared introduction) | EXPAND with prescribed table (see Step 3) |
| 59-63| dimensional-invariant bullets | already explicit (LITERAL + AUDIENCE/TRIP) | LEAVE |
| 77   | "always fetches in `'driving'` mode" | TRIP (literal value 'driving' makes meaning unambiguous) | LEAVE — `'driving'` self-qualifies |
| 79   | `trailMode` state | LITERAL (variable) | LEAVE |
| 91   | "Trail mode toggle prop" | OTHER (UI feature name) | LEAVE |
| 100  | "mode segment + action row" | TRIP | REWRITE → "trip-mode segment" |
| 105  | "Mode segmented control" / "POIs in 'hiking' mode" | TRIP / LITERAL | REWRITE first; LEAVE second |
| 116  | `pois.narration_cache` JSON-key spec `"{mode}-{depth}-{voice_id}"` | TRIP + voice_id→narrator_slug | REWRITE |
| 121  | `narration_audio` schema row, "...mode, status..." | LITERAL (column) | LEAVE |
| 130  | Cache-key shape spec line | TRIP + voice_id→narrator_slug (catalog 5.18 explicit) | REWRITE |
| 134  | `useTTS({ mode: NarrationMode, depth: ... })` TS shape | LITERAL (TS type) | LEAVE |
| 137  | `poi.narration_cache["{mode}-{depth}-{voice_id}"]` lookup | TRIP + voice_id→narrator_slug | REWRITE |
| 150-152 | `useTTS({ mode: 'driving' })` etc. | LITERAL (code) | LEAVE |
| 161  | `body: { ... mode, depth, voice_id? }` HTTP body | LITERAL (API field name) | LEAVE |
| 168  | Storage path `{poi_id}/{mode}/{depth}/{voice_id}.opus` | TRIP + voice_id→narrator_slug | REWRITE |
| 185  | "Mode/depth axes affect length" | TRIP (Storage path is trip-mode) | REWRITE |
| 188  | `corridor_mode` parameter | LITERAL (function param) | LEAVE |
| 193  | "model `grok-2-latest`" | OTHER (LLM model) | LEAVE |
| 197  | `corridor_mode` parameter | LITERAL | LEAVE |
| 199  | `audience_mode` already explicit | already correct | LEAVE |
| 206  | `precache_mode: true` flag | LITERAL (boolean flag name) | LEAVE |
| 209  | "all four modes seeded" | AUDIENCE | REWRITE → "all four audience modes" |
| 340  | "live mode upserts" (CLI execution mode) | OTHER | LEAVE |
| 350  | "Venue Tour mode" | OTHER (named feature, not the mode column) | LEAVE |
| 385  | "Trail Mode" UI label | OTHER (literal UI string) | LEAVE |
| 515,518,519,536 | `modelOverride` / `modelOrVoice` / `model_or_voice` | LITERAL (TS/SQL field names) | LEAVE |
| 538  | DDL `mode text CHECK('driving','hiking','city')` | LITERAL (DDL) | LEAVE |
| 561  | DDL `mode CHECK('family','kids','unfiltered','local')` | LITERAL (DDL) | LEAVE |
| 562  | `idx_voice_configs_active_mode...` / "one active voice per mode" | LITERAL / AUDIENCE | LEAVE first; REWRITE second |
| 564  | "Audience modes:" already explicit | LEAVE |
| 568  | "Family mode" already explicit | LEAVE |
| 571  | `scripts/audition-output/{mode}/{voice_id}.opus` | AUDIENCE (audition is per audience mode) | REWRITE |
| 581-593,707,710,726 | `--mode=family`, `--mode driving`, etc. | LITERAL (CLI flags) | LEAVE |
| 597  | "Output: `scripts/audition-output/{mode}/`" | AUDIENCE | REWRITE |
| 610  | "3 candidates per mode" | AUDIENCE | REWRITE |
| 612  | table header `\| Mode \|` | AUDIENCE (12-row candidates table) | REWRITE |
| 644  | `narration_audio.status/mode` | LITERAL (column refs) | LEAVE |
| 657  | "this trip-mode + depth + voice already?" / `poi_id, mode, depth, narrator_slug` | already-explicit + LITERAL | LEAVE |
| 661  | `trip_mode.sql` filename | LITERAL | LEAVE |
| 668  | "for all 4 modes" | AUDIENCE | REWRITE |
| 669  | "one active row per mode" | AUDIENCE | REWRITE |
| 700  | "top (mode, depth) combos from the trips table" | TRIP | REWRITE |
| 744  | "Trip-mode vs audience-mode collision" / explanatory paragraph | already explicit | LEAVE |
| 753  | "top mode×depth combos (default: driving + hiking × top 3 depths)" | TRIP | REWRITE |
| 754  | "active voice per mode from `voice_configs`" | AUDIENCE | REWRITE |
| 756  | "narration_audio upsert (... mode set)" | LITERAL (column) | LEAVE |
| 773  | sweeper Storage path `{poi_id}/{mode}/{depth}/{narrator_slug}.opus` | TRIP | REWRITE |

**Counts:** AUDIENCE rewrites = 9. TRIP rewrites = 9. COMPOUND rewrites = 1 (the "Mode column semantics" header section gets the canonical table absorbed in). AMBIGUOUS = 0 — every occurrence resolved cleanly from context.

---

## Step 2 — Diffs applied

Per-edit summary (intent only — actual edits are made directly via the Edit tool against CLAUDE.md):

| # | line(s) | before → after |
|---|---------|----------------|
| 1 | 100 | "mode segment + action row" → "trip-mode segment + action row" |
| 2 | 105 | "Mode segmented control" → "Trip-mode segmented control" |
| 3 | 116 | `narration_cache` key example `"{mode}-{depth}-{voice_id}"` → `"{trip_mode}-{depth}-{narrator_slug}"` |
| 4 | 130 | Cache key line: `{poi_id}-{mode}-{depth}-{voice_id}.opus` (Storage) / `{mode}-{depth}-{voice_id}` (JSON) → `{poi_id}-{trip_mode}-{depth}-{narrator_slug}.opus` / `{trip_mode}-{depth}-{narrator_slug}` |
| 5 | 137 | `poi.narration_cache["{mode}-{depth}-{voice_id}"]` → `poi.narration_cache["{trip_mode}-{depth}-{narrator_slug}"]` |
| 6 | 168 | Server upload-path `{poi_id}/{mode}/{depth}/{voice_id}.opus` → `{poi_id}/{trip_mode}/{depth}/{narrator_slug}.opus` |
| 7 | 185 | "Mode/depth axes affect length" → "Trip-mode/depth axes affect length" |
| 8 | 209 | "all four modes seeded and engine-ready" → "all four audience modes seeded and engine-ready" |
| 9 | 562 | "one active voice per mode at all times" → "one active voice per audience mode at all times" |
|10 | 571 | `scripts/audition-output/{mode}/{voice_id}.opus` → `scripts/audition-output/{audience_mode}/{voice_id}.opus` |
|11 | 597 | `scripts/audition-output/{mode}/` → `scripts/audition-output/{audience_mode}/` |
|12 | 610 | "3 candidates per mode" → "3 candidates per audience mode" |
|13 | 612 | table header `\| Mode \|` → `\| Audience mode \|` |
|14 | 668 | "for all 4 modes" → "for all 4 audience modes" |
|15 | 669 | "one active row per mode → Phase 7..." → "one active row per audience mode → Phase 7..." |
|16 | 700 | "top (mode, depth) combos from the trips table" → "top (trip-mode, depth) combos from the trips table" |
|17 | 753 | "top mode×depth combos (default: driving + hiking × top 3 depths)" → "top trip-mode×depth combos (default: driving + hiking × top 3 depths)" |
|18 | 754 | "active voice per mode from `voice_configs`" → "active voice per audience mode from `voice_configs`" |
|19 | 773 | sweeper `{poi_id}/{mode}/{depth}/{narrator_slug}.opus` → `{poi_id}/{trip_mode}/{depth}/{narrator_slug}.opus` |
|20 | 58-66 (Mode column semantics section) | Replaced with the prescribed dimensional-model intro + table from the prompt's Step 3 (since SKILL.md was skipped, this becomes the canonical home for it). |

---

## Step 3 — Dimensional model section (now in CLAUDE.md)

The prompt scoped the canonical dimensional-model table for SKILL.md. Since SKILL.md was skipped (user choice via AskUserQuestion), the table was absorbed into CLAUDE.md's existing "Mode column semantics" section, expanded to use the prompt-prescribed intro paragraph + table format. The pre-existing bullet list is dropped since the table supersedes it.

---

## Step 4 — Drift catalog 5.18 update

[docs/drift-catalog.md](drift-catalog.md) entry 5.18 gets a `**Status:**` field appended at the bottom. Original `**Posture:**` and `**Action:**` fields preserved verbatim per the format-preservation principle from the merge.

---

## Files modified by this audit

- [CLAUDE.md](../CLAUDE.md) — 19 prose rewrites + 1 section reformat
- [docs/drift-catalog.md](drift-catalog.md) — Status appended to 5.18
- [docs/audit-mode-terminology.md](audit-mode-terminology.md) — this file (new)

## Files NOT modified

- **SKILL.md** — does not exist on disk; user chose "skip"
- All code (`*.ts`, `*.js`, `*.tsx`, `*.sql`) — these are LITERAL occurrences (column names, CLI flags, TS types, function params); column-name renames are out of scope per prompt
