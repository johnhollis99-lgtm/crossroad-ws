#!/usr/bin/env node
/**
 * Verification pass for poi_review_queue candidates.
 *
 * For each pending row:
 *   - confidence < 0.7  → mark needs_human (no LLM call)
 *   - confidence >= 0.7 → ask Claude to verify the source_quote supports the claim
 *       supports=true  → verification_passed=true; if confidence >= 0.85, auto-approve
 *       supports=false → needs_human
 *
 * Idempotent: only touches rows where review_status='pending' and verification_passed=false.
 *
 * Usage:
 *   npx tsx verify.ts [--dry-run] [--limit <n>] [--source <name>]
 */

import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import Anthropic from '@anthropic-ai/sdk';
import { getAdminClient } from './lib/supabase.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const MODEL              = 'claude-sonnet-4-6';
const RATE_INTERVAL_MS   = 200;   // 5 calls/sec
const AUTO_APPROVE_CONF  = 0.85;
const AUTO_VERIFY_CONF   = 0.70;

// Token pricing per 1M tokens
const PRICE_INPUT        = 3.00;
const PRICE_OUTPUT       = 15.00;
const PRICE_CACHE_WRITE  = 3.75;
const PRICE_CACHE_READ   = 0.30;

// ── System prompt (static — cached across all verification calls) ─────────────

const SYSTEM_PROMPT =
  'You are verifying whether a quoted passage supports a claim. Be strict. ' +
  'Answer with JSON only: { "supports": true|false, "reasoning": "1 sentence" }';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReviewRow {
  id:                   string;
  name:                 string;
  event_summary:        string;
  place_name_in_source: string;
  source_quote:         string;
  llm_confidence:       number;
}

interface VerifyResult {
  supports:   boolean;
  reasoning:  string;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseVerifyResult(raw: string): VerifyResult | null {
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try {
    const obj = JSON.parse(stripped) as { supports?: unknown; reasoning?: unknown };
    if (typeof obj.supports !== 'boolean') return null;
    return {
      supports:  obj.supports,
      reasoning: typeof obj.reasoning === 'string' ? obj.reasoning : '',
    };
  } catch {
    // Try to extract first {...} block
    const match = stripped.match(/\{[\s\S]*?\}/);
    if (match) {
      try {
        const obj = JSON.parse(match[0]) as { supports?: unknown; reasoning?: unknown };
        if (typeof obj.supports === 'boolean') {
          return { supports: obj.supports, reasoning: String(obj.reasoning ?? '') };
        }
      } catch { /* fall through */ }
    }
    return null;
  }
}

let lastCallAt = 0;

async function waitForSlot(): Promise<void> {
  const now  = Date.now();
  const wait = lastCallAt + RATE_INTERVAL_MS - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

// ── Core verification call ────────────────────────────────────────────────────

async function verifyRow(
  anthropic: Anthropic,
  row: ReviewRow,
): Promise<{ result: VerifyResult | null; cost: TokenCost }> {
  await waitForSlot();

  const cost: TokenCost = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };

  const userContent =
    `Claim: ${row.event_summary} at ${row.place_name_in_source}\n\n` +
    `Quoted passage from the source: "${row.source_quote}"\n\n` +
    `Does the quoted passage directly and unambiguously support both the event and the place?`;

  const response = await anthropic.messages.create({
    model:      MODEL,
    max_tokens: 256,
    system: [
      {
        type:          'text',
        text:          SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userContent }],
  });

  const usage = response.usage as unknown as {
    input_tokens:                number;
    output_tokens:               number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?:     number;
  };
  cost.inputTokens      = usage.input_tokens       ?? 0;
  cost.outputTokens     = usage.output_tokens       ?? 0;
  cost.cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
  cost.cacheReadTokens  = usage.cache_read_input_tokens     ?? 0;

  const textBlock = response.content.find((b) => b.type === 'text');
  const rawText   = textBlock?.type === 'text' ? textBlock.text : '';
  const result    = parseVerifyResult(rawText);

  return { result, cost };
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

async function runVerify(opts: {
  dryRun:   boolean;
  limit?:   number;
  source?:  string;
}): Promise<void> {
  const supabase  = getAdminClient();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // When --source is specified, resolve document IDs first to avoid a deep join type
  let documentIdFilter: string[] | null = null;
  if (opts.source) {
    const { data: docs, error: docErr } = await supabase
      .from('narrative_documents')
      .select('id')
      .eq('source', opts.source);
    if (docErr) throw new Error(`Failed to resolve source "${opts.source}": ${docErr.message}`);
    documentIdFilter = ((docs ?? []) as { id: string }[]).map((d) => d.id);
    if (documentIdFilter.length === 0) {
      console.log(chalk.yellow(`[verify] no documents found for source "${opts.source}"`));
      return;
    }
  }

  // Fetch pending, unverified candidates
  let query = supabase
    .from('poi_review_queue')
    .select('id, name, event_summary, place_name_in_source, source_quote, llm_confidence')
    .eq('review_status', 'pending')
    .eq('verification_passed', false)
    .order('llm_confidence', { ascending: false });

  if (documentIdFilter) {
    query = query.in('narrative_document_id', documentIdFilter);
  }
  if (opts.limit) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch review queue: ${error.message}`);

  const rows: ReviewRow[] = ((data ?? []) as unknown[]).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id:                   row['id']                   as string,
      name:                 row['name']                 as string,
      event_summary:        row['event_summary']        as string,
      place_name_in_source: row['place_name_in_source'] as string,
      source_quote:         row['source_quote']         as string,
      llm_confidence:       Number(row['llm_confidence']),
    };
  });

  const highConf = rows.filter((r) => r.llm_confidence >= AUTO_VERIFY_CONF);
  const lowConf  = rows.filter((r) => r.llm_confidence <  AUTO_VERIFY_CONF);

  console.log(chalk.cyan(
    `[verify] ${rows.length} pending rows — ` +
    `${highConf.length} to verify, ${lowConf.length} low-confidence → needs_human`,
  ));
  if (opts.dryRun) console.log(chalk.yellow('[verify] DRY RUN — no DB writes'));

  // ── Step 1: Mark low-confidence rows as needs_human ───────────────────────
  if (lowConf.length > 0 && !opts.dryRun) {
    const ids = lowConf.map((r) => r.id);
    const { error: updateErr } = await supabase
      .from('poi_review_queue')
      .update({ review_status: 'needs_human' })
      .in('id', ids);
    if (updateErr) {
      console.error(chalk.red(`[verify] low-conf bulk update error: ${updateErr.message}`));
    } else {
      console.log(chalk.gray(`  marked ${ids.length} low-confidence rows as needs_human`));
    }
  } else if (lowConf.length > 0) {
    console.log(chalk.gray(`  (dry) would mark ${lowConf.length} low-confidence rows as needs_human`));
  }

  // ── Step 2: LLM verification for high-confidence rows ────────────────────
  const totals: TokenCost = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };
  let passed    = 0;
  let failed    = 0;
  let approved  = 0;
  let parseErrs = 0;
  let apiErrors = 0;

  for (const row of highConf) {
    let result: VerifyResult | null = null;
    let cost: TokenCost   = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };

    if (!opts.dryRun) {
      try {
        ({ result, cost } = await verifyRow(anthropic, row));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`  [${row.id}] API error: ${msg}`));
        apiErrors++;
        continue;
      }

      totals.inputTokens      += cost.inputTokens;
      totals.outputTokens     += cost.outputTokens;
      totals.cacheWriteTokens += cost.cacheWriteTokens;
      totals.cacheReadTokens  += cost.cacheReadTokens;

      if (!result) {
        console.warn(chalk.yellow(`  [${row.id}] could not parse LLM response — skipping`));
        parseErrs++;
        continue;
      }
    } else {
      // Dry-run: simulate a positive result so we can log the flow
      result = { supports: true, reasoning: '(dry run)' };
    }

    // Determine new state
    const nowPassed        = result.supports;
    const newReviewStatus  = nowPassed
      ? (row.llm_confidence >= AUTO_APPROVE_CONF ? 'approved' : 'pending')
      : 'needs_human';

    // Log
    const statusLabel = nowPassed
      ? (newReviewStatus === 'approved' ? chalk.green('APPROVED') : chalk.cyan('passed → pending'))
      : chalk.yellow('failed → needs_human');
    const costStr = opts.dryRun ? '' : ` ($${tokensToDollars(cost).toFixed(4)})`;
    console.log(
      `  ${statusLabel}  conf=${row.llm_confidence.toFixed(2)}  ` +
      `"${row.name ?? row.event_summary.slice(0, 50)}"${costStr}`,
    );
    if (!nowPassed) {
      console.log(chalk.gray(`    reason: ${result.reasoning}`));
    }

    if (nowPassed) passed++; else failed++;
    if (newReviewStatus === 'approved') approved++;

    if (!opts.dryRun) {
      const patch: Record<string, unknown> = {
        verification_passed:    nowPassed,
        verification_reasoning: result.reasoning,
        review_status:          newReviewStatus,
      };
      if (newReviewStatus === 'approved') {
        patch['reviewed_at'] = new Date().toISOString();
        patch['reviewed_by'] = 'auto';
      }
      const { error: updateErr } = await supabase
        .from('poi_review_queue')
        .update(patch)
        .eq('id', row.id);
      if (updateErr) {
        console.error(chalk.red(`  [${row.id}] update error: ${updateErr.message}`));
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalCost = tokensToDollars(totals);
  console.log('');
  console.log(chalk.bold('── Verification summary ────────────────────────────'));
  console.log(`  Low-confidence → needs_human : ${lowConf.length}`);
  console.log(`  Verified (high-conf)         : ${highConf.length - apiErrors - parseErrs}`);
  console.log(`    Passed                     : ${passed}`);
  console.log(`      Auto-approved            : ${approved}`);
  console.log(`      Awaiting human review    : ${passed - approved}`);
  console.log(`    Failed → needs_human       : ${failed}`);
  if (parseErrs > 0)  console.log(chalk.yellow(`  Parse errors (skipped)       : ${parseErrs}`));
  if (apiErrors > 0)  console.log(chalk.red(`  API errors (skipped)         : ${apiErrors}`));
  if (!opts.dryRun) {
    console.log('');
    console.log(chalk.bold('── Token usage ─────────────────────────────────────'));
    console.log(`  Input            : ${totals.inputTokens.toLocaleString()} tokens`);
    console.log(`  Output           : ${totals.outputTokens.toLocaleString()} tokens`);
    console.log(`  Cache write      : ${totals.cacheWriteTokens.toLocaleString()} tokens`);
    console.log(`  Cache read       : ${totals.cacheReadTokens.toLocaleString()} tokens`);
    console.log(`  Estimated cost   : $${totalCost.toFixed(4)}`);
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('xroad-narrative-verify')
  .description('LLM verification pass for poi_review_queue candidates')
  .version('0.1.0')
  .option('--dry-run',       'Run LLM calls but do not write to DB', false)
  .option('--limit <n>',     'Cap total rows to process', (v) => Number(v))
  .option('--source <name>', 'Restrict to one narrative source (wpa-guide, bancroft, cdnc)')
  .action(async (cliOpts: { dryRun: boolean; limit?: number; source?: string }) => {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error(chalk.red('ANTHROPIC_API_KEY not set'));
      process.exit(1);
    }
    try {
      await runVerify({ dryRun: cliOpts.dryRun, limit: cliOpts.limit, source: cliOpts.source });
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
