# Conversational Query Mode — v1.5 feature concept

**Created:** 2026-05-18
**Status:** Concept captured; design + implementation deferred to v1.5
**Scope:** Parallel interaction paradigm to the existing push-narration model

## Context — push vs. pull

XRoad v1 ships a **push** narration model: unsolicited audio triggered by GPS proximity, region transitions, iconic-local overrides, and the lookahead queue. The user opens the app, picks a route, and listens; the system decides what plays and when, governed by the soul doctrine, Pace setting, significance floors, and the curator's `editorial_curated` gate.

The push model is one half of a complete trip-companion experience. The other half — the **pull** model — is the user asking the assistant a question and getting a contextual answer. Curator's canonical example: passing through Nipomo at 1:42 PM, asking *"hungry, anything good around here?"* The assistant answers using **current location + trip context** (mode, speed, recent narration history, user prefs, time-of-day, regional context), with the same voice and same brain as the narration system, distinguishable only by the interaction trigger (user voice vs. GPS proximity).

Both models share the catalog, voice config, SSML pipeline, and audio queue infrastructure. They are not separate products — they are two paradigms of a single conversational companion.

## Decision

**Capture the concept now; design + implementation arc happens in v1.5, after v1 narration ships and proves itself.**

Two reasons for the deferral:

1. **v1 needs to validate the push model first.** Voice tone, narration quality, soul-doctrine surfacing, curator-gate workflow, and the SSML pipeline all need a real listener trip to know if they work. Adding pull capability before push is proven would double the surface under test.
2. **External-data policy is unresolved.** Pull queries often want answers beyond the editorial catalog — restaurant recommendations, current hours, current weather. The catalog can answer "what historical landmarks are nearby" but cannot answer "is the Madonna Inn café open right now." The design choice between staying editorial-only, partnering for external data, or hybrid-with-opt-in needs curator decision in the v1.5 design phase (see "External data policy — open" below).

This doc is the **anti-preclusion** artifact: it locks the namespace, calls out the v1 infrastructure pieces that need to leave room for pull, and parks the design until the v1.5 arc opens.

## Technical shape (sketch — to be refined in v1.5 design)

```
User says "hungry, anything good around here?"
      ↓
[STT] native iOS/Android speech-to-text (free, on-device, no cost)
      ↓
[Context assembly] location, region, mode, speed, time-of-day, recent
  narration history, user prefs (audience_mode, narrative_focus, etc.)
      ↓
[Query routing] Haiku decides:
  - Catalog query (Soul + Iconic Local)?  → POI/region lookup via existing RPCs
  - Trip-context question?                → narration_plays history + route state
  - External data?                        → see external-data policy
      ↓
[Response generation] Haiku synthesizes a 2-4 sentence answer
      ↓
[SSML + TTS] existing pipeline — narrator_b Family Sadachbia 1.0 + ssmlize()
      ↓
[Audio queue] suspend any in-flight narration (priority over push), play
  response, resume on completion
```

Each query is **stateless** (no multi-turn dialog in v1.5; one question, one answer, return to push mode). Multi-turn is a v2+ concept if the v1.5 paradigm proves engaging.

### Cost model — rough envelope

| Component | Cost per query | Notes |
|---|---|---|
| STT (native) | $0 | iOS Speech / Android SpeechRecognizer; both free, on-device |
| Haiku query routing + response | ~$0.005 | ~500 input tokens (system + context) + ~200 output tokens at $1/$5 per M |
| Google TTS Chirp 3 HD | ~$0.015 | ~1,000 chars × $16/M chars (HD tier) |
| **Total per query** | **~$0.02** | |

For typical usage of ~5 queries per Road Pass trip: **~$0.10/trip per user** marginal pull cost on top of push narration cost.

Regional response caching (same query at same region → cached SSML+audio) could halve this; out of scope for the v1.5 design but trivially layerable on top of the existing region-narration cache.

### Tier gating proposal (TBD)

- **Free tier:** N queries per trip (e.g., 3), reverts to push-only after exhausted
- **Road Pass:** unlimited queries

Aligned with the broader v1 monetization story per addendum §13.

## External data policy — open question for v1.5 design

Three options, no decision yet:

### Option A — Stay editorial

Only answer about POIs in the curated catalog + Iconic Local set + regions. Refuse or redirect external-data questions ("I don't know if the Madonna Inn is open, but here's what I do know about it").

**Pro:** Quality and accuracy guarantees (everything comes from curator-verified content). No external-API cost, no data-staleness risk, no partner contracts.
**Con:** Frustrating for common road-trip questions (food, gas, lodging, current conditions). The user will lose trust if the assistant says "I don't know" too often.

### Option B — External partner data

Integrate Google Places, Yelp Fusion, or OpenStreetMap Overpass for restaurants/gas/lodging; OpenWeather or NOAA for weather; etc. Per-query cost goes up, schema gets external dependencies, but the assistant can answer the obvious road-trip questions.

**Pro:** Powerful, expected by users coming from generic voice-assistant ecosystems.
**Con:** Per-API contracts, per-query costs (often gated on API tier), partner dependencies, data-quality variance, partner ToS constraints on what can be cached / re-spoken.

### Option C — Hybrid: editorial first, opt-in external

Default to editorial answers. If the query clearly needs external data (food/gas/current hours), the assistant says *"I can check Google Places for that if you want — just say yes"* and only pings the external API on confirmation. Each external query costs whatever the API costs; user controls when that fires.

**Pro:** Combines editorial quality with external coverage; user opts in to external-data cost/staleness tradeoffs per query.
**Con:** Adds a turn to common queries (confirm-then-answer); requires good intent classification to know when an editorial answer suffices vs. external is needed.

**Recommendation order for the v1.5 design lap:** start with Option C as the framing, evaluate Option A as the conservative fallback, treat Option B as the expansion target only after we have data on how often editorial alone suffices.

## v1 anti-preclusion checklist

The push-narration v1 build must not paint pull mode into a corner. Three concrete items to bake in **before** v1 ships:

### 1. Audio queue priority for query response

The lookahead worker's queue (per addendum §10) already supports the Iconic Local Override priority lane. Pull-query responses extend the same priority concept: **a user voice-trigger interrupts any in-flight push narration with priority above Iconic Local.** This needs to be implementable as a queue-priority enum extension, not a separate queue. The Iconic Local plumbing landing in v1 lookahead-worker work should leave room for one more priority tier above it (`query_response`) without architectural surgery.

### 2. Server-side namespace reserved

Create `server/prompts/queries/` as an empty directory tree (with a `.gitkeep` and a `README.md` calling out the planned use). Parallel to `server/prompts/regions/` and `server/prompts/pois/` per the prosody arc convention. Locks the namespace so v1.5 prompt authoring lands cleanly without renaming sibling trees.

### 3. Driving-page button layout reserves an "ask" position

The driving page UI (`app/drive.tsx`) sheet/header layout should reserve a button position for an **"Ask"** affordance (likely an icon-only mic button, top-right of the now-playing card). It can be hidden under `__DEV__` or feature-flagged-off in v1 ship, but the layout shouldn't need redesign when v1.5 lands. This is a 30-min UI scaffold during the Pine drive-screen Phase 3 cleanup arc; flag in the implementation prompt for that screen.

## v1.5 roadmap slot

Logged in [docs/roadstory-unified-roadmap.md](../roadstory-unified-roadmap.md) v1.5 backlog as "Conversational Query Mode (Voice Assistant)".

**Sequencing assumption:** v1 → public launch → 2-4 weeks listening to real usage data → design lap → v1.5 arc opens. The design lap is the right time to:
- Pick the external-data option (A/B/C)
- Resolve tier-gating numbers
- Decide single-turn vs. multi-turn
- Settle on regional-caching policy

## Out of scope for this decision

- Concrete API contracts (Google Places, Yelp, etc.) — picked during external-data option resolution, not now
- Specific Haiku query-routing prompt — drafted in the v1.5 design lap
- Multi-turn dialog — explicitly v2+, not v1.5
- Voice-print authentication / per-user voice training — v2+
- Push-to-talk UI vs. wake-word — UX decision in v1.5 design, both are viable

## Relationship to other docs

- **Narration addendum [§13](../roadstory-narration-curation-addendum.md):** addendum forward-references this doc; addendum covers push, this doc covers pull. Same brain, two paradigms.
- **Soul doctrine ([addendum §1](../roadstory-narration-curation-addendum.md)):** the catalog's soul-layer organization (history, geology, geography, anthropology) is the same source the query mode would read from. No schema changes needed on the catalog side to support pull.
- **Voice configs / SSML pipeline:** unchanged. Pull responses use the same `narrator_b × family × Sadachbia 1.0` voice (or whatever the active config picks) and the same `ssmlize()` pipeline. The pipeline is voice-agnostic and surface-agnostic by design (this was confirmed during the narrator_b prosody arc).
