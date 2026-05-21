# Narration preview workflow

Curator dev tool for previewing how a source description sounds as synthesized narration before committing to Tier 1 data inserts, Tier 2 callout writes, or audience-mode template tweaks.

**Pipeline:** curator-authored source → Claude (Sonnet 4.6 by default) → SSML post-processor → Google Cloud TTS Chirp 3 HD → local `.opus` + `.txt` artifact.

Does **not** write to `narration_audio` or upload to Supabase Storage. Local-only artifacts for review.

## Prerequisites

These env vars must be set in the root `.env`:

- `ANTHROPIC_API_KEY`
- `GOOGLE_APPLICATION_CREDENTIALS` — path to a GCP service-account JSON with Cloud TTS scope
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — used for `voice_configs` lookup only

## Usage

```bash
# Tier 1 mode (default) — cadence rewrite of curator-authored source
# Voice locked to narrator_b/family via voice_configs (currently Sadachbia 1.0×)
npx tsx scripts/narration-preview/preview.ts --source madonna-inn

# Dry-run: print resolved prompts without spending tokens
npx tsx scripts/narration-preview/preview.ts --source madonna-inn --dry-run

# Override the synthesis model (default is claude-sonnet-4-6)
npx tsx scripts/narration-preview/preview.ts --source madonna-inn --model claude-haiku-4-5-20251001
```

## CLI flags

| Flag | Default | Notes |
|---|---|---|
| `--source <id>` | (required) | Pick from `sources/*.ts` exports. Currently: `madonna-inn`. |
| `--mode tier1\|standard` | `tier1` | `tier1` = cadence rewrite, locked to family/Sadachbia voice. `standard` reserved for future audience-tuning + Tier 2 work — exits with "not yet wired" message. |
| `--audience family\|kids\|unfiltered\|local` | `family` | Ignored when `--mode tier1` (locks to family). |
| `--model <id>` | `claude-sonnet-4-6` | Override to compare against Haiku, etc. |
| `--cost-ceiling <usd>` | `1.00` | Aborts before any API call if projected spend exceeds this. |
| `--dry-run` | off | Print prompts, skip API calls. |

## Adding a new source

Create `sources/<id>.ts` exporting a `SourceRecord`:

```typescript
import type { SourceRecord } from './madonna-inn.js';
// (Or re-export the type from a shared module if you prefer.)

export const MY_SOURCE: SourceRecord = {
  id: 'my-source-id',
  name: 'Public-facing landmark name',
  category_display: 'Iconic Landmark',
  source_citation: 'curator-authored, 2026-MM-DD',
  description: `The full curator-calibrated source text here...`,
};
```

Then register it in `preview.ts`'s `SOURCES` map.

## Output

Each run produces two files in `output/` (gitignored):

- `<source>-<mode>-<timestamp>.opus` — audio
- `<source>-<mode>-<timestamp>.txt` — transcript with header metadata (model, voice, cost, duration, marker counts, key themes)

Read the `.txt` while listening to the `.opus` to spot mismatches between intended cadence and synthesized output.

## Tier 1 mode — what it does

The `tier1-soul-full.ts` prompt instructs Claude to **lightly rewrite for spoken cadence** rather than synthesize from grounding. The source is preserved at the level of:

- All proper nouns (people, places, businesses, products)
- All dates
- All quoted material (with attribution)
- All factual specifics (counts, dimensions, durations)
- Narrative order across paragraphs and sentences

Only cadence-smoothing adjustments are allowed: connective tissue between beats, light reordering within a single sentence, pause markers, conjunction tightening, sentence merges within a paragraph.

Target output: **~500–550 words spoken / ~3.5–4 minutes at speaking rate 1.0**.

## Architecture notes

- The Tier 1 prompt (`prompts/tier1-soul-full.ts`) inherits PROSODY DISCIPLINE + MOTION & DISTANCE FRAMING + listener-imperative bans verbatim from `server/prompts/pois/narrator_b_family.js`. When those evolve in production, manually mirror them here — there is no shared module (production templates are `.js`/CommonJS, this is `.ts`/ESM).
- Voice resolution always goes through the `voice_configs` DB lookup; a hardcoded voice fallback would diverge from production over time.
- This tool is permanent scaffolding for narration iteration — Tier 2 callout previews, audience-mode tuning, pace calibration. Don't delete after Tier 1 ships.
