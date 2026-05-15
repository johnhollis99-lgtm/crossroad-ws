# Voice plan — 6-voice hybrid (collapses Family + Local per narrator)

**Created:** 2026-05-15
**Phase:** D3 (voice_configs schema + voice seeding)
**Status:** Adopted

## Decision

Phase D3 ships **6 distinct voices** instead of the addendum-§5.6-prescribed
8 (2 narrators × 4 audiences). The hybrid collapses the Family and Local
audience modes within each narrator into a single shared voice:

| narrator | family | local | kids | unfiltered |
|---|---|---|---|---|
| narrator_a (reverent / "Window Seat") | Iapetus | **Iapetus (shared)** | TBD | Charon |
| narrator_b (conversational / "Shotgun") | Sulafat | **Sulafat (shared)** | TBD | TBD |

`voice_configs` still carries one row per (mode, narrator_slug) — 8 rows
once all slots fill — but two pairs of rows reference the same `voice_id`.
The same voice_id appearing in two rows is intentional and not denormalized
into a separate `voices` table; per the SKILL.md content-addressed cache
model, voice_configs is the right home for per-(mode, narrator) settings
even when the underlying voice is shared.

## Rationale

Family and Local audience registers are similar enough — warm, accessible,
neither particularly playful (kids) nor particularly dry (unfiltered) —
that one voice per narrator can carry both with content tuning at the
prompt-template layer rather than the voice layer. Doubling Iapetus and
Sulafat into both modes per narrator preserves narrator identity (the
two-narrator user-facing distinction) without burning a distinct
synth-voice slot on a tone modifier the prompt can already handle.

## Trade-off

Slight loss of local-mode auditory distinctiveness — a Local-mode
listener won't hear a different voice than the Family-mode default, only
different content. Distinctness still surfaces in prompt-driven content
(the local prompt template emphasizes insider framing, hidden histories,
local idiom; the family template stays warm and broadly accessible). If
post-launch usage data shows local-mode users want a more distinct
auditory cue, this is reversible via voice_configs versioning — pick a
new local-only voice, deactivate the shared row, insert a Local-specific
row at version+1. No schema work needed.

## Implementation

`narrator_slug` column on `voice_configs` (added by D3 migration, with
CHECK constraint on `('narrator_a', 'narrator_b')`); partial unique index
swapped from `(mode) WHERE is_active = true` →
`(mode, narrator_slug) WHERE is_active = true` so multiple narrators can
each own one active voice per audience mode without collision.

## Initial seed (5 rows live post-Track-1 commit)

- (family, narrator_a) → Iapetus — kept the existing live row, just
  attaches `narrator_slug='narrator_a'` via the migration backfill
- (local, narrator_a) → Iapetus — new row, same voice_id as family
- (unfiltered, narrator_a) → Charon — new row
- (family, narrator_b) → Sulafat — new row
- (local, narrator_b) → Sulafat — new row, same voice_id as family

3 slots remain pending re-audition: (kids, narrator_a), (kids, narrator_b),
(unfiltered, narrator_b). Curator selects from 2 alternatives per slot in
Track 2; rows seeded once picks land.
