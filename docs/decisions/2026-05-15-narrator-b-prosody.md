# Narrator B prosody — Tier 1 fix (punctuation tuning + speakingRate 0.95)

**Created:** 2026-05-15
**Phase:** E2 (region narration pre-generation)
**Status:** Tier 1 failed A/B (speed drag + digit-reading bug surfaced); **Tier 2 enlarged (SSML pipeline) in test-render cycle**

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

---

## Tier 1 result + Tier 2 enlarged scope (2026-05-18 follow-up)

### Tier 1 outcome

Three test renders generated at speakingRate 0.95 + the punctuation-tuned + sci-data-rule template (Sierra Nevada × 2 + Mono Basin × 1; the regions table has two rows named "Sierra Nevada" — USGS geomorphic province + EPA Level III ecoregion). Curator listened. Verdict:

- **Pause / enunciation discipline:** confirmed improvement. Em-dashes generating longer pauses, period-fragmented sentence boundaries reading cleanly.
- **Speed at 0.95:** drags. Net listening experience worse than 1.0.
- **Digit-reading bug surfaced (not a Tier-1-induced regression — pre-existing behavior, only visible because the new template emits more precise digits):** `"6,380 feet"` was synthesized as `"six three eight zero feet"` instead of `"six thousand three hundred eighty feet"`. Google Chirp 3 HD's default digit reading is digit-by-digit, not cardinal-by-magnitude.

Tier 1 is therefore **not enough**. Two problems to solve, not one:
1. The pauses need to land without slowing the overall speech rate.
2. Numbers need explicit `<say-as interpret-as="cardinal">` wrapping so they're read as full cardinals.

### Tier 2 enlarged — adopted

Pivot to **SSML mode at speakingRate 1.0**. The pre-reserved Tier 2 (just `[pause]` markup tokens) is insufficient because the markup field doesn't carry `<say-as>`. SSML is the only path that bundles both fixes.

**Implementation landed on the feature branch:**

- New post-processor `scripts/lib/tts/ssml.ts` — pure-function `ssmlize()` + `stripMarkersAndTags()` + `tallyMarkers()`. Pure-function, no Supabase dependency, unit-testable in isolation.
- Marker syntax (Path B from the open question) — LLM emits `{{PAUSE_500}}` / `{{PAUSE_250}}` plus prose; the post-processor handles all SSML construction. **The LLM never emits raw XML**, which sidesteps malformed-XML and unwrapped-number risk classes entirely. Numbers (digit sequences matching `\d+(?:,\d{3})*(?:\.\d+)?`) are auto-wrapped — the LLM cannot forget a `<say-as>` because it never writes one.
- Body is XML-escaped (`&`, `<`, `>`, `"`, `'`) before tag insertion. PUA character placeholders (U+E000+) reserve insertion slots so that digits inside attribute values (e.g., `500` in `time="500ms"`) cannot be re-wrapped by the cardinal pass.
- Provider auto-detects SSML by leading `<speak>` token in `scripts/lib/tts/providers/google.ts`. Existing text-mode callers (POI narration, region precache) unaffected — they don't emit `<speak>`.
- Fallback: on SSML synthesis failure, `stripMarkersAndTags()` produces plain-text from the same Haiku output, retried with `input: { text }`. Failure marker logged to `llm_calls` as `model_or_voice = '{voice_id}__SSML_PARSE_FAILED'` with `cost_usd=0` for grep-ability.
- speakingRate stays 1.0. **Runtime override removed** from the test script. Voice_configs unchanged.
- Test script writes to side-channel `regions-prosody-test/{region_id}/narrator_b_ssml_rate1.0.opus`. Production cuts at `regions/{region_id}/narrator_b.opus` and prior 0.95 test cuts at `regions-prosody-test/{region_id}/narrator_b.opus` both untouched — curator can A/B three versions side-by-side.

### Why marker syntax over LLM-direct SSML

The open question in the curator pivot asked: LLM emits SSML directly, or marker syntax + post-processor? Chosen: marker syntax.

- **Robustness against Haiku XML quirks.** Haiku occasionally produces `<break time=500ms />` (missing quotes), `<break time="500ms">` (no self-close), or `<say-as interpret-as=cardinal>` (no attribute quotes). Google's SSML parser rejects the entire `<speak>` doc on any of these. Markers can't be malformed in a way that breaks synthesis — they either match the regex exactly or they don't (and unmatched markers strip harmlessly).
- **Exhaustive number wrapping.** The "every digit gets a wrapper" rule is non-negotiable. If the LLM owns wrapping, one forgotten number breaks the rule. The post-processor wraps every digit sequence regex-deterministically.
- **Trivial plain-text fallback.** Same Haiku output yields both SSML and fallback via `stripMarkersAndTags()`. No re-generation cost.
- **Easy levers-diff counting.** Marker counts and SSML tag counts are both grep-cheap; both reported per render in the chat post.

### Tier 2 evaluation gate

The 3 re-renders post to curator as `narrator_b_ssml_rate1.0.opus` side-channel URLs. Curator A/B-compares against (a) production cuts and (b) the prior 0.95 cuts. Three possible verdicts:

1. **1.0 + SSML approved** → cherry-pick docs to main, merge feature branch with SSML pipeline. No voice_configs migration. POI inventory work (deliverables A + C + D) continues in parallel. No 162-batch.
2. **Number fix lands but pauses still wrong** → tweak `<break>` durations in marker-rule template ({{PAUSE_500}} → `750ms` or {{PAUSE_250}} → `350ms`), re-render. No code-path change required.
3. **SSML pipeline keeps breaking on edge cases** (Google rejects doc, fallback fires too often) → fall back to Chirp 3 HD's `markup` field with `[pause]` tokens + template rule to spell numbers as words. Slower fix but more deterministic synthesis surface.

Still parked regardless of outcome: kids / local samplers, no 162-batch.

---

## Number Format Disambiguation — Highways and Years (2026-05-18 follow-up)

### Context

Tier 2 cardinal-wrapping fixed the original "six three eight zero feet" bug — every digit sequence is now wrapped in `<say-as interpret-as="cardinal">`, so quantities read correctly. But two number-types should NOT be read as cardinals:

- **Highway numbers.** "Highway 395" → "three ninety-five" (route-name convention), not "three hundred ninety-five." "I-405" → "the four-oh-five" (LA-specific phonetic), not "the four hundred five." Cardinal wrapping makes highway numbers sound like quantities, which is wrong.
- **Calendar years.** "1849" → "eighteen forty-nine" (year-reading), not "one thousand eight hundred forty-nine." Cardinal wrapping makes years sound like distances, which is wrong.

The Tier 2 first cut wrapped highway "395" as cardinal in the Mono Basin render (Google read it as "three hundred ninety-five"), and would have done the same with any year reference. Curator flagged the highway case during the 3-way A/B; year handling was approved as an addressable concern in the same pass.

### Two-layer fix — upstream-primary, downstream-safety-net

**Layer 1 (primary): template instruction.** The LLM is told to spell highway numbers and calendar years phonetically in the narration body. Phonetic forms are context-aware in a way regex can't match — "Highway 1" is genuinely just "Highway 1" (digit OK), "Highway 49" is "Highway forty-nine", "I-405" is "the four-oh-five." The LLM applies the right form per-highway based on the lookup table embedded in the template.

The template lookup table (in all 4 narrator_b region templates):
- I-5/10/15/40/80, I-110/210/710, I-405/605/805 — explicit phonetic forms ("the [phonetic]")
- US-101 → "the one-oh-one"
- US-395 → "three ninety-five"
- CA-1 → "Highway 1" or "PCH"
- CA-49 → "Highway forty-nine"
- CA-99 → "Highway ninety-nine"
- Fallback patterns for unlisted highways (2-digit, 3-digit-middle-zero, 3-digit-middle-nonzero)

Calendar years (1500 through 2100, covering California history from Cabrillo 1542 onward): phonetic per standard year-reading. Measurement durations ("10,000 years ago", "100 million years") stay as digits since they are quantities, not dates.

**Layer 2 (safety net): post-processor skip detection.** `scripts/lib/tts/ssml.ts` skips cardinal-wrapping on:
- Digit sequences immediately preceded by /\b(Highway|Hwy|Interstate|Route|Rte|I-|US-|CA-|SR-|State Route)\s*-?\s*$/i (within a 30-char preceding window)
- Bare 4-digit years matching /^(1[5-9]\d{2}|20\d{2}|21\d{2})$/ NOT followed by a measurement unit (feet, miles, years, million, etc.)

Skipped digits pass through to Google's TTS in their original form. Google's default reading heuristic kicks in:
- "Highway 395" without `<say-as>` → "Highway three ninety-five" (Google's road-number heuristic)
- "1849" without `<say-as>` → "eighteen forty-nine" (Google's year heuristic)

This works because Google's defaults are correct for these surfaces; cardinal wrapping was actively *making them worse*. The skip restores correct behavior when the LLM slips and emits digits despite the template instruction.

### Upstream-vs-downstream reasoning

The primary path is the template (Layer 1). The safety net (Layer 2) catches slips but is not the design intent. Reasons:

1. **Phonetic spelling sounds more natural than even-correct Google reads.** "The four-oh-five" beats "Highway four hundred five" beats "Highway four-oh-five" in LA-driver authenticity. Only the LLM can pick this register.
2. **Context-sensitivity exceeds regex.** "Highway 1" should stay "Highway 1" (or become "PCH"); "Highway 49" should become "Highway forty-nine." The template lookup table captures these per-highway rules. A pure regex can't.
3. **The safety net is for slips, not the spec.** If the LLM follows the template, the skip count is zero. If skips are nonzero, that's a signal the template wording needs tightening — not a working-as-intended state.

### Adherence audit

Skip events are logged to `llm_calls` with `model_or_voice = 'ssmlize_skip_highway'` or `'ssmlize_skip_year'` and `cost_usd = 0`. Curator can SQL-aggregate over time to monitor LLM adherence to the phonetic-spelling instruction. A persistent nonzero skip rate is the signal to strengthen the template — not to remove the safety net.

```sql
-- Adherence audit query
SELECT model_or_voice, COUNT(*) AS skip_count, MIN(created_at), MAX(created_at)
FROM llm_calls
WHERE model_or_voice LIKE 'ssmlize_skip_%'
GROUP BY model_or_voice;
```

### Marker frequency floor (2026-05-18 same commit)

Curator flagged "slight prematurity on a few calls" in the Tier 2 first cuts — Haiku emitted only 1+1 markers per narration despite the template allowing up to 4×{{PAUSE_500}} + 6×{{PAUSE_250}}. Template language flipped from cap-only ("at most 4") to floor + cap ("AT LEAST 2 per narration; at most 4"). Same for {{PAUSE_250}} ("AT LEAST 3 per narration; at most 6"). Plus reinforcement: "Emit these liberally where the prose supports them — especially after numerical facts and at transitional beats. The 'at least' floors exist because under-using markers reads as prematurity on numerical calls." Example marker placements in all 4 templates updated to show the new floor.

### Validation

Single re-render of Mono Basin (only — the two Sierra Nevada cuts already passed curator's A/B). Verifies:
- "395" reads as "three ninety-five" (skipped + Google road heuristic, or LLM spelled phonetically)
- Increased marker frequency (≥2×500 + ≥3×250) addresses prematurity
- No regression on number-reading for measurements (square miles, feet)

On Mono Basin pass: cherry-pick docs to main, merge feature branch (3 commits) to main. NO `voice_configs` migration (rate stays 1.0). Existing 108 region narrations stay untouched per curator's "do not rewrite" rule — they retain the legacy digit-reading behavior; new narrations (POIs going forward, any future region work) use the new pipeline. Known tradeoff, accepted.

After merge: pivot to POI inventory work (deliverables A + C + D), which has been parked through this whole prosody arc.

### Precision-regression sub-fix (2026-05-18 same-commit amend)

First Mono Basin re-render with the marker-floor + highway/year template revealed that Haiku **over-generalized the phonetic rule** beyond its intended scope. Despite the template's `DEFAULT: write numbers as digits` instruction, Haiku spelled every number phonetically: "seven thousand feet" (instead of 6,378), "six hundred square miles" (instead of 634), "five hundred years old" (rounded approximation of recent volcanic activity). Output had 0 `<say-as>` tags because there were no digit sequences to wrap.

This was a precision regression — production's "6,400 feet / 13,000 feet" beats new render's "seven thousand feet" on the curator's intensified precise-sci-data rule. Phonetic-by-default looked safe from the cardinal-wrap bug class, but the trade-off cost too much precision to be acceptable.

**Fix (amended into the same feature commit):** tightened all 4 narrator_b region templates with:

1. **Strengthened DEFAULT** — promoted from "write numbers as digits when the source has digits" to "DEFAULT (REQUIRED — applies to ALL measurements): write numbers as digits, with all precision the source supports." Enumerated what counts as a measurement (elevations, distances, populations, areas, ages, durations, counts, square mileages, percentages).
2. **Anti-examples block** — explicit do-not-do entries pulled directly from the Mono Basin regression: "Write '6,378 feet' — NOT 'seven thousand feet' (precision lost)"; "Write '634 square miles' — NOT 'six hundred square miles'"; etc.
3. **Anti-generalization guardrail** — single sentence: "DO NOT generalize the phonetic rule beyond the two narrow exceptions below. Spelling out measurements ... is a PRECISION REGRESSION and an error."
4. **Renamed exceptions** — "EXCEPTION 1 — CALIFORNIA HIGHWAY NUMBERS (and only highway numbers)" and "EXCEPTION 2 — CALENDAR YEARS 1500–2100 (and only calendar years in that range)" to scope the rules tightly.
5. **Marker-placement examples updated** — Family example flips "a hundred million years ago" → "100 million years ago"; Kids example same; Unfiltered example bumps Death Valley reference to specific elevation digits; Local example flips "Sixteen switchbacks" → "16 switchbacks". Every example now models digits-for-measurements + phonetic-for-highways/years.

The Layer 1 template fix is the primary defense. The Layer 2 post-processor (highway + year skip detection) is unchanged — still acts as safety net for slips on the two narrow exceptions. The post-processor does NOT skip measurement-digit wrapping; that's still desired.

Validation: re-render Mono Basin a second time with the tightened template. Expected: `<say-as>` count > 0 (measurements appearing as digits and getting wrapped), precision preserved (e.g., 6,378 feet for Mono Lake elevation, not "seven thousand"), highway/year skip count stays at 0 unless the source happens to mention a highway or year.

### Cardinal-content sanitization (2026-05-18 same-commit amend)

Second Mono Basin re-render produced 5× `<say-as interpret-as="cardinal">` wraps with the precision-restored template — but curator listening surfaced a new failure: **multiple altitude omissions in the audio**. The voice was synthesizing "feet" (and likely "square miles," "years") with no preceding number on several measurement references.

Hypothesis (curator-flagged): Google's `<say-as interpret-as="cardinal">` silently drops content when the wrapped text contains commas (or other non-digit chars). Of the 5 wrapped measurements — `634` (no comma) vs `6,380` / `13,061` / `100,000` / `8,000` (comma-formatted) — the 4 comma-formatted ones drop silently, producing zero audio for the wrapped content and leaving only the surrounding unit token.

**Diagnostic** ([scripts/diag-ssml-comma-cardinal.ts](../../scripts/diag-ssml-comma-cardinal.ts)): three minimal SSML synthesis A/B tests at the production voice + speakingRate. Result (run 2026-05-18):

| Pair | SSML content | Audio buffer | Verdict |
|---|---|---:|---|
| A — comma | `<say-as>6,380</say-as>` | 5336 B | Comma drops content |
| A — bare  | `<say-as>6380</say-as>`  | 11227 B | Full reading |
| B — comma | `<say-as>100,000</say-as>` | 6247 B | Comma drops content |
| B — bare  | `<say-as>100000</say-as>`  | 9875 B | Full reading |
| C — plain | `<say-as>634</say-as>`     | 9760 B | Control (no comma) |

Comma-wrapped audio runs ~47–63% the size of bare-wrapped at identical surrounding prose. Plain `634` (no comma) matches the bare-wrapped baseline. **Hypothesis confirmed.** Google's [SSML docs](https://docs.cloud.google.com/text-to-speech/docs/ssml) only ever show bare-digit examples (`<say-as interpret-as="cardinal">10</say-as>`, `<say-as interpret-as="cardinal">12345</say-as>`); the docs do not mention comma-handling and behavior is silent failure rather than parse error.

**Fix** (`scripts/lib/tts/ssml.ts`): strip non-digit characters from the content inside the cardinal `<say-as>` tag at post-processor build time. The prose body keeps human-readable commas for the LLM-emitted `narration_text`; only the tag's content is sanitized.

```typescript
const digitsOnly = match.replace(/[^0-9]/g, '');
return reserve(`<say-as interpret-as="cardinal">${digitsOnly}</say-as>`);
```

The regex `/[^0-9]/g` strips commas, decimal points, hyphens, and any other non-digit. Per the curator's spec verbatim.

**Decimal-handling note (follow-up consideration, not blocking).** Current region narrations contain only integer measurements (elevations, square miles, populations, ages-in-thousands-or-millions). If future narrations include decimals like `0.5 miles` or `1.5 million years`, the digits-only strip turns `0.5` into `05`, which reads as "five" rather than "zero point five" — a precision regression on decimal measurements. Mitigation if it becomes an issue: change the strip pattern to `/[^0-9.]/g` (preserve decimal points) and empirically re-confirm Google handles decimal cardinals correctly (the docs are silent on this too). Out of scope for current Mono Basin cycle.

**Adherence audit (existing) and waveform diagnostic (new).** The `ssmlize_skip_highway` / `ssmlize_skip_year` rows in `llm_calls` continue to track Layer 2 skip events. The diagnostic script is checked in as a future regression test: re-run it after any Google TTS provider migration to confirm cardinal-handling assumptions still hold.

Validation: re-render Mono Basin a third time with sanitization in place. Expected: all 5 measurements read fully ("six hundred thirty-four square miles", "six thousand three hundred eighty feet", "thirteen thousand sixty-one feet", "one hundred thousand years", "eight thousand feet"). SSML preview shows bare-digit content inside the `<say-as>` tags (`>6380<`, not `>6,380<`).
