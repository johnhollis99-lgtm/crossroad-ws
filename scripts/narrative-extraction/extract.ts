#!/usr/bin/env node
/**
 * Narrative extraction pipeline
 *
 * Reads unprocessed chunks from narrative_documents, sends each to Claude for
 * POI candidate extraction, geocodes candidates via Nominatim, and queues
 * results in poi_review_queue.
 *
 * Usage:
 *   npx tsx extract.ts [--dry-run] [--limit <n>] [--reextract] [--source <name>]
 */

import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { Command } from 'commander';
import chalk from 'chalk';
import Anthropic from '@anthropic-ai/sdk';
import { getAdminClient } from './lib/supabase.js';
import { geocodeOne } from './lib/geocode.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Constants ─────────────────────────────────────────────────────────────────

const MODEL            = 'claude-sonnet-4-6';
const RATE_INTERVAL_MS = 200;   // 5 chunks/sec
const MIN_QUOTE_CHARS  = 15;

// Token pricing per 1M tokens
const PRICE_INPUT        = 3.00;
const PRICE_OUTPUT       = 15.00;
const PRICE_CACHE_WRITE  = 3.75;
const PRICE_CACHE_READ   = 0.30;

const CACHE_DIR = path.join(__dirname, 'cache');

// ── System prompt (verbatim) ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You extract location-tied historical events from primary source text for a GPS-triggered storytelling app.

CRITICAL RULES:
1. You may only output a POI candidate if the source text contains a verbatim passage that directly supports the event AND ties it to a specific place.
2. You MUST quote that passage exactly in \`source_quote\`. Quotes longer than 60 words must be trimmed to the most relevant sentence.
3. If a candidate cannot be supported by a direct quote, do not output it. Hallucination is a critical failure.
4. Place names must appear in the source itself or be unambiguously derivable from it. Do not infer locations from world knowledge.

Output a JSON array. If the chunk contains no location-tied events, output [].

Each candidate:
{
  "name": "short evocative name for the POI (e.g., 'Steinbeck\\'s Tortilla Flat')",
  "event_summary": "1-2 sentences describing what happened",
  "place_name_in_source": "the place exactly as named in the source",
  "geocoding_hint": "city/county/region to disambiguate during geocoding",
  "date_or_period": "as specific as the source allows",
  "source_quote": "exact verbatim quote from the source",
  "category_guess": "labor_history | literary | indigenous | gold_rush | civil_rights | crime | folklore | architecture | maritime | military | other",
  "confidence": 0.0-1.0
}`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface NarrativeChunk {
  id:          string;
  source:      string;
  title:       string;
  url:         string;
  chunk_index: number;
  chunk_text:  string;
}

interface LLMCandidate {
  name:                 string;
  event_summary:        string;
  place_name_in_source: string;
  geocoding_hint?:      string;
  date_or_period?:      string;
  source_quote:         string;
  category_guess:       string;
  confidence:           number;
}

interface TokenCost {
  inputTokens:      number;
  outputTokens:     number;
  cacheWriteTokens: number;
  cacheReadTokens:  number;
}

function tokensToDollars(c: TokenCost): number {
  return (
    (c.inputTokens      / 1_000_000) * PRICE_INPUT +
    (c.outputTokens     / 1_000_000) * PRICE_OUTPUT +
    (c.cacheWriteTokens / 1_000_000) * PRICE_CACHE_WRITE +
    (c.cacheReadTokens  / 1_000_000) * PRICE_CACHE_READ
  );
}

// ── JSON parsing ──────────────────────────────────────────────────────────────

function parseJsonArray(raw: string): LLMCandidate[] {
  // Strip markdown code fences if present
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try {
    const parsed = JSON.parse(stripped);
    return Array.isArray(parsed) ? (parsed as LLMCandidate[]) : [];
  } catch {
    // Try to extract the first [...] block
    const match = stripped.match(/\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]) as LLMCandidate[]; } catch { /* fall through */ }
    }
    return [];
  }
}

// ── Rate limiter ──────────────────────────────────────────────────────────────

let lastCallAt = 0;

async function waitForSlot(): Promise<void> {
  const now  = Date.now();
  const wait = lastCallAt + RATE_INTERVAL_MS - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

async function extractChunk(
  anthropic: Anthropic,
  chunk: NarrativeChunk,
  dryRun: boolean,
): Promise<{ candidates: LLMCandidate[]; dropped: number; cost: TokenCost }> {
  await waitForSlot();

  const cost: TokenCost = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };

  if (dryRun) {
    return { candidates: [], dropped: 0, cost };
  }

  const response = await anthropic.messages.create({
    model:      MODEL,
    max_tokens: 4096,
    system: [
      {
        type:          'text',
        text:          SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role:    'user',
        content: `Source: ${chunk.source}\nTitle: ${chunk.title}\n\n${chunk.chunk_text}`,
      },
    ],
  });

  // Accumulate token counts (cache fields via type assertion — newer SDK versions)
  const usage = response.usage as unknown as {
    input_tokens:               number;
    output_tokens:              number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?:     number;
  };
  cost.inputTokens      = usage.input_tokens      ?? 0;
  cost.outputTokens     = usage.output_tokens      ?? 0;
  cost.cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
  cost.cacheReadTokens  = usage.cache_read_input_tokens     ?? 0;

  const textBlock = response.content.find((b) => b.type === 'text');
  const rawText   = textBlock?.type === 'text' ? textBlock.text : '';

  const all      = parseJsonArray(rawText);
  const valid:   LLMCandidate[] = [];
  let   dropped  = 0;

  for (const c of all) {
    if (!c.source_quote || c.source_quote.trim().length < MIN_QUOTE_CHARS) {
      dropped++;
      continue;
    }
    if (!c.name || !c.event_summary || !c.place_name_in_source) {
      dropped++;
      continue;
    }
    valid.push(c);
  }

  return { candidates: valid, dropped, cost };
}

async function processChunks(opts: {
  limit?:      number;
  dryRun:      boolean;
  reextract:   boolean;
  source?:     string;
  cacheDir:    string;
}): Promise<void> {
  const supabase  = getAdminClient();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Fetch unprocessed chunks
  let query = supabase
    .from('narrative_documents')
    .select('id, source, title, url, chunk_index, chunk_text')
    .order('source')
    .order('url')
    .order('chunk_index');

  if (!opts.reextract) {
    query = query.is('extracted_at', null);
  }
  if (opts.source) {
    query = query.eq('source', opts.source);
  }
  if (opts.limit) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch chunks: ${error.message}`);

  const chunks = (data ?? []) as NarrativeChunk[];
  console.log(chalk.cyan(`[extract] ${chunks.length} chunks to process`));
  if (opts.dryRun) console.log(chalk.yellow('[extract] DRY RUN — no DB writes'));

  // Totals
  const totals: TokenCost = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };
  let totalCandidates  = 0;
  let totalDropped     = 0;
  let totalQueued      = 0;
  let totalErrors      = 0;

  // Process per-document groupings for summary logging
  let currentDoc      = '';
  let docChunks       = 0;
  let docCandidates   = 0;
  let docDropped      = 0;

  function flushDocSummary(): void {
    if (!currentDoc) return;
    console.log(
      chalk.gray(
        `  [${currentDoc}] chunks=${docChunks} candidates=${docCandidates} dropped=${docDropped}`,
      ),
    );
    docChunks = docCandidates = docDropped = 0;
  }

  for (const chunk of chunks) {
    const docKey = `${chunk.source}::${chunk.url}`;
    if (docKey !== currentDoc) {
      flushDocSummary();
      currentDoc = docKey;
    }
    docChunks++;

    try {
      const { candidates, dropped, cost } = await extractChunk(anthropic, chunk, opts.dryRun);

      totals.inputTokens      += cost.inputTokens;
      totals.outputTokens     += cost.outputTokens;
      totals.cacheWriteTokens += cost.cacheWriteTokens;
      totals.cacheReadTokens  += cost.cacheReadTokens;
      totalCandidates  += candidates.length;
      totalDropped     += dropped;
      docCandidates    += candidates.length;
      docDropped       += dropped;

      if (!opts.dryRun) {
        // Geocode + insert each candidate
        for (const cand of candidates) {
          const geocodeQuery = cand.geocoding_hint
            ? `${cand.place_name_in_source}, ${cand.geocoding_hint}`
            : cand.place_name_in_source;

          let proposedLocation: string | null = null;
          let geocodeDisplayName: string | null = null;
          let reviewStatus: 'pending' | 'needs_human' = 'pending';

          try {
            const geo = await geocodeOne(geocodeQuery, {
              cacheDir: opts.cacheDir,
              countrycodes: 'us',
            });
            if (geo) {
              proposedLocation   = `SRID=4326;POINT(${geo.lng} ${geo.lat})`;
              geocodeDisplayName = geo.displayName;
            } else {
              reviewStatus = 'needs_human';
            }
          } catch {
            reviewStatus = 'needs_human';
          }

          const { error: insertError } = await supabase
            .from('poi_review_queue')
            .insert({
              narrative_document_id: chunk.id,
              name:                  cand.name,
              event_summary:         cand.event_summary,
              place_name_in_source:  cand.place_name_in_source,
              geocoding_hint:        cand.geocoding_hint ?? null,
              date_or_period:        cand.date_or_period ?? null,
              source_quote:          cand.source_quote,
              category_guess:        cand.category_guess,
              llm_confidence:        cand.confidence,
              proposed_location:     proposedLocation,
              geocode_display_name:  geocodeDisplayName,
              review_status:         reviewStatus,
            });

          if (insertError) {
            console.error(chalk.red(`  [insert error] ${insertError.message}`));
            totalErrors++;
          } else {
            totalQueued++;
          }
        }

        // Mark chunk as processed
        await supabase
          .from('narrative_documents')
          .update({ extracted_at: new Date().toISOString() })
          .eq('id', chunk.id);
      }

      // Per-chunk log line
      const chunkCost = tokensToDollars(cost);
      process.stdout.write(
        chalk.gray(
          `  chunk ${chunk.chunk_index} — ` +
          `${candidates.length} candidates, ${dropped} dropped` +
          (opts.dryRun ? '' : ` — $${chunkCost.toFixed(4)}`),
        ) + '\n',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`  [chunk ${chunk.id}] error: ${msg}`));
      totalErrors++;
    }
  }

  flushDocSummary();

  // ── Final summary ──────────────────────────────────────────────────────────
  const totalCost = tokensToDollars(totals);
  console.log('');
  console.log(chalk.bold('── Extraction summary ──────────────────────────────'));
  console.log(`  Chunks processed : ${chunks.length}`);
  console.log(`  Candidates found : ${totalCandidates}`);
  console.log(`  Candidates dropped (no quote): ${totalDropped}`);
  if (!opts.dryRun) {
    console.log(`  Queued in review : ${totalQueued}`);
    console.log(`  Errors           : ${totalErrors > 0 ? chalk.red(String(totalErrors)) : totalErrors}`);
  }
  console.log('');
  console.log(chalk.bold('── Token usage ─────────────────────────────────────'));
  console.log(`  Input            : ${totals.inputTokens.toLocaleString()} tokens`);
  console.log(`  Output           : ${totals.outputTokens.toLocaleString()} tokens`);
  console.log(`  Cache write      : ${totals.cacheWriteTokens.toLocaleString()} tokens`);
  console.log(`  Cache read       : ${totals.cacheReadTokens.toLocaleString()} tokens`);
  console.log(`  Estimated cost   : $${totalCost.toFixed(4)}`);
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('xroad-narrative-extract')
  .description('LLM extraction of POI candidates from narrative_documents')
  .version('0.1.0')
  .option('--dry-run',         'Call LLM but do not write to DB', false)
  .option('--reextract',       'Re-process chunks that already have extracted_at set', false)
  .option('--limit <n>',       'Cap total chunks to process', (v) => Number(v))
  .option('--source <name>',   'Restrict to one source (wpa-guide, bancroft, cdnc)')
  .option('--cache-dir <dir>',  'Geocode cache directory', CACHE_DIR)
  .action(async (cliOpts: {
    dryRun:    boolean;
    reextract: boolean;
    limit?:    number;
    source?:   string;
    cacheDir:  string;
  }) => {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error(chalk.red('ANTHROPIC_API_KEY not set'));
      process.exit(1);
    }

    await fs.mkdir(path.join(cliOpts.cacheDir), { recursive: true });

    try {
      await processChunks({
        limit:     cliOpts.limit,
        dryRun:    cliOpts.dryRun,
        reextract: cliOpts.reextract,
        source:    cliOpts.source,
        cacheDir:  cliOpts.cacheDir,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`Fatal: ${msg}`));
      process.exit(1);
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
