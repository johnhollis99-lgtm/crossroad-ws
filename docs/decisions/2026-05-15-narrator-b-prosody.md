# Narrator B prosody — Tier 1 fix (punctuation tuning + speakingRate 0.95)

**Created:** 2026-05-15
**Phase:** E2 (region narration pre-generation)
**Status:** Tier 1 in test-render cycle; Tier 2 reserved

## Context

Curator listened to 10 narrator-A region samplers and confirmed a pivot to **narrator B only** for the remaining 162 generations (narrator_b × {kids, unfiltered, local} × 54 regions). Narrator A is shelved, not abandoned — deferred until narrator_b prosody is dialed in. Hard rule from curator: the existing 108 production narrations are not to be rewritten. All changes below apply to **new generation only**.

Curator's two prosody complaints on narrator_b (Sadachbia, en-US-Chirp3-HD-Sadachbia, currently at speakingRate 1.00 for family and local):

1. A few inflection points feel off.
2. Pauses are too short, especially at commas — curator wants longer pauses at certain phrasing breaks.

## Investigation summary

Per current [Google Cloud TTS Chirp 3 HD docs](https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd), the fix space on **synchronous** requests (which is what our precache pipeline uses) is:

| Lever | How it's applied | Risk / cost |
|---|---|---|
| **A** SSML `<prosody rate="…">` | Wraps text; requires switching `input: { text }` → `input: { ssml }`; XML escaping; redundant with `speakingRate` param | Medium — adds an input mode |
| **B** SSML `<break time="500ms"/>` | Inline tags at curator-targeted positions; requires `input: { ssml }` | Medium — inline tag wrangling, XML escaping |
| **C** Chirp-3-native `[pause short]` / `[pause long]` markup | Inline tokens; requires switching `input: { text }` → `input: { markup }` (the pause tokens **only** work in `markup`, not `text`) | Low-medium — small provider change + template instruction to emit tokens |
| **D** `speakingRate` parameter | Single value (0.25–2.0) on `audioConfig`; already wired in [scripts/lib/tts/providers/google.ts](../../scripts/lib/tts/providers/google.ts) per-voice via `voice_configs.voice_settings.speakingRate` | None — config-only |
| **E** LLM template punctuation tuning | Em-dashes for asides, period breaks between distinct beats, fewer commas-mid-thought. Chirp 3 HD gives sentence boundaries (.) the longest natural pause, em-dashes a noticeably longer pause than commas. | None — prompt-side only |

## Decision: Tier 1 = D + E

Apply the two zero-infrastructure levers first:

- **D — speakingRate** for narrator_b family and local: 1.00 → **0.95**. Kids stays 1.05 (intentionally brighter), unfiltered stays 0.95 (already there).
- **E — template punctuation tuning** in all 4 narrator_b region prompts (family, kids, unfiltered, local): em-dashes for asides; period breaks between distinct beats; sentence-end periods preferred over comma-mid-thought; comma usage trimmed.

Bundled in the same edit:
- **Precise scientific data rule** (curator step 4). The existing "concrete and specific over general" quality bullet is promoted to a hard rule: when the source supports it, narrations MUST include precise scientific data — geological ages in millions of years, named epochs, elevations in feet, distances in miles, populations, areas. Round only when the source rounds. The vague version of a number is worse than no number.

Both prosody complaints get addressed simultaneously: reducing comma count means the prosody engine has fewer mid-thought breaks to fight; em-dashes and periods give it the long pauses curator wants at "certain phrasing breaks"; speakingRate 0.95 lengthens every pause by ~5% as a baseline.

## Tier 2 (reserved — only if Tier 1 fails A/B)

If curator listens to the 2 test renders and still wants longer surgical pause control:

- **C — `[pause short]` / `[pause long]` markup tokens** at specific phrasing breaks. Implementation cost ~30 min:
  - Provider change: detect `[pause` in input text, switch from `input: { text }` to `input: { markup }`
  - Template instruction: emit pause tokens at most ~6 per narration, only at curator-targeted positions

Tier 2 is held in reserve. We don't burn the implementation budget until we know Tier 1 isn't enough.

## Why not SSML (`<prosody>` / `<break>`) this round

Chirp 3 HD supports both on synchronous requests. They were rejected for Tier 1 because:

- Adopting SSML means switching the input mode to `ssml`, with XML escaping for all narration text, harder debugging when content has `&`, `<`, `"`, or apostrophes.
- The `[pause]` markup field accomplishes the same surgical-pause goal with simpler escaping (none — it's still plain text plus literal `[pause short]` substrings).
- `<prosody rate>` is redundant with the `speakingRate` audio-config parameter we already use.

If Tier 1 + Tier 2 both prove inadequate, SSML is the next escape hatch — but the cost of reaching for it is the input-mode switch, not the tag syntax.

## Test-render plan

Two narrations — Sierra Nevada + Mono Basin × narrator_b × Family — at the new rate + new template, posted as a direct A/B against the existing production cuts.

- Standalone script `scripts/test-prosody-render.ts` — no DB writes, no `narration_audio` row mutation, no skip-if-ready logic.
- Side-channel Storage path: `regions-prosody-test/{region_id}/narrator_b.opus` (parallel folder — production `regions/{region_id}/narrator_b.opus` cuts stay intact per curator's "do not rewrite" rule).
- speakingRate 0.95 passed via `voiceConfigOverride`, NOT via a `voice_configs` row update — no migration until A/B passes.
- Inline-modified templates loaded directly from `server/prompts/regions/narrator_b_*.js` on a feature branch (not merged to main).
- Output: two public URLs posted in chat, alongside a per-render levers diff (em-dash count, comma count, precise scientific facts surfaced) so the curator A/B is evidence-based, not vibes-based.
- Cost: ~$0.05 total; runtime ~30s.

## Sequencing if Tier 1 passes A/B

1. Merge the feature-branch template edits to main.
2. Migration `<date-prefix>_voice_configs_narrator_b_rate_0_95.sql` flipping narrator_b family + local `voice_settings.speakingRate` 1.00 → 0.95. New version bump.
3. Add `--force` flag to `scripts/precache-region-narrations.ts` (currently skip-if-ready only) for the case where curator wants narrator B cuts regenerated post-tuning (NOT applied to the existing 108 narrations — narrator_b only; narrator A stays shelved).
4. Run the 162-batch: `npx tsx precache-region-narrations.ts --audience kids,unfiltered,local --live`. Estimated $3.70, ~50 min.

## Sequencing if Tier 1 fails A/B

1. Append a follow-up section to this decision doc capturing what didn't work in Tier 1 and why we moved to Tier 2.
2. Implement Tier 2 (provider `markup` field switch + template pause-token instructions).
3. Re-run the 2 test renders; second A/B cycle.
4. On Tier 2 pass: merge template + provider changes, voice_configs migration if speakingRate stays at 0.95, then 162-batch.

## Out of scope for this decision

- Narrator A re-tuning. Shelved, not abandoned — separate decision when its turn comes.
- ElevenLabs voice swap (per CLAUDE.md "TTS provider roadmap (locked 2026-05-18)"). When ElevenLabs lands, prosody is re-evaluated against the new provider's defaults — Tier 1 work here is provider-portable in spirit (template tuning) but speakingRate semantics differ across providers.
- Existing 108 narrations. Per curator hard rule, they are not rewritten regardless of Tier 1/2 outcome.
