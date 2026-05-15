# Phase E1c (indigenous_territory regions) — deferred to v2

**Date:** 2026-05-14
**Status:** Deferred, NLD commercial-license outreach in flight
**Decision owner:** john hollis
**Affected work:** Phase E1c of the regions importer (per [docs/roadstory-narration-curation-addendum.md](../roadstory-narration-curation-addendum.md) §3 and [docs/roadstory-unified-roadmap.md](../roadstory-unified-roadmap.md) §4)

## Context

The addendum specifies a parallel narration layer for Indigenous traditional territories — present-tense framing of who lives here and stewarded this land. The canonical polygon source is Native Land Digital (NLD), the same dataset that powers native-land.ca. RoadStory is commercial.

## Licensing finding

NLD publishes two documents that conflict on commercial use:

- **Data Sovereignty Treaty** (governs API access, current as of late 2024) — Section 2 explicitly prohibits: *"Charge money for access to or integration of NLD API data in any form, including as part of a subscription, membership, or bundled service."* and *"Use the API for commercial purposes, including monetized platforms, data resale, or proprietary applications."* No paid commercial tier offered.
- **About and Disclaimers** (older) — states the dataset is *"under any proprietary license; the work can be considered under a CC0 license (free to use in any way you like)"* with a softer ask to *"consider the morality of how you use this dataset."*

The Treaty is the newer, more specific document and governs API access. Mirror sources (ArcGIS Hub, GitHub, Canadian Open Government Portal) technically inherit CC0 but using them to bypass the steward's stated intent for a commercial app shipping Indigenous-territory narration conflicts with the addendum's own framing of Indigenous peoples as present-tense, living stewards.

Verbatim clauses + full sources captured in the chat transcript on 2026-05-14.

## Decision

**Defer E1c to v2.** Do not import indigenous_territory polygons via API or mirror until NLD grants explicit written permission for commercial use. Pursue (a) + (c) in parallel:

- **(a)** Send NLD a commercial-license request describing the use case (GPS-triggered narration, full attribution per region narration, attribution surface in app settings, present-tense framing, no ownership/sovereignty claims).
- **(c)** Ship the rest of Phase E1 (E1a USGS Geomorphic Provinces ✓ landed, E1b EPA L3 Ecoregions ✓ landed, E1d named valleys/basins, E1e watersheds) without E1c. Reserve the schema slot.

## Schema state — reserved, not loaded

Migration `20260514000005_regions.sql` (applied 2026-05-14) defines the `regions_region_type_check` CHECK constraint with five enum values including `'indigenous_territory'`. The enum value stays in place; zero rows will be inserted with `region_type='indigenous_territory'` until this decision is reversed. No empty stub importer, no placeholder data, no follow-up migration needed when the layer ships — the schema is already correct.

## Conditions under which the layer ships

The layer ships when **any one** of the following is true:

1. NLD grants explicit written permission for RoadStory's commercial use, with terms we can meet (attribution, framing, disclaimer surface).
2. NLD publishes a paid commercial-license tier and we sign for it.
3. A separate, license-clean source of traditional/ancestral territory polygons emerges that matches the addendum's design intent (must be traditional territory, not current legal jurisdictional boundaries).

## Fallback if NLD declines

In priority order:

1. **Per-tribe published boundaries** — slow, inconsistent coverage. Only viable for the few CA tribes that publish their own traditional-territory polygons under open license. Would yield a partial layer.
2. **US Bureau of Indian Affairs (BIA) federally-recognized tribal land boundaries** — public domain but covers current reservations only. **This is a fundamentally different thing than traditional territory** and would change what `indigenous_territory` means in the addendum. Adopting this fallback requires an addendum revision; do not silently substitute.
3. **Drop the layer entirely.** Update addendum §3 to remove indigenous_territory as a region type. Schema CHECK enum value stays defensively (cheap to keep) but is documented as never-populated.

## Revisit triggers

- NLD replies to the outreach (any outcome — yes, no, or conditional).
- A new license-clean traditional-territory source surfaces.
- 90 days elapse with no reply → escalate or move to fallback (1) or (3).

## Related files

- [docs/roadstory-narration-curation-addendum.md](../roadstory-narration-curation-addendum.md) §3 — Regions design
- [docs/roadstory-unified-roadmap.md](../roadstory-unified-roadmap.md) §4 — Phase E1 sequencing
- [supabase/migrations/20260514000005_regions.sql](../../supabase/migrations/20260514000005_regions.sql) — schema with reserved enum value
