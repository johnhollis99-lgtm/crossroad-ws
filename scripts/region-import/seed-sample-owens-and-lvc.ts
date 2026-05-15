#!/usr/bin/env node
/**
 * Phase 3 of E1d: generate seed-text samples for Owens Valley + Long Valley
 * Caldera using the canonical SEED_TEXT_SYSTEM_PROMPT.
 *
 * Single deliverable — two samples for curator tone-check. Stop here before
 * the other 28.
 *
 * Owens Valley is the contested-history guardrail test (LA water diversion,
 * Manzanar, Indigenous displacement — the prompt's no-narrator-personality
 * constraint should keep the seed neutral despite emotional source material).
 *
 * Long Valley Caldera is the Tier-B Wikidata-buffer test (no name-match OSM
 * polygon; the seed text needs to work from Wikipedia context alone).
 *
 * Run from scripts/region-import/:
 *   npx tsx seed-sample-owens-and-lvc.ts
 */
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import chalk from 'chalk';

import { callHaiku, SEED_TEXT_SYSTEM_PROMPT, buildSeedTextUserPrompt } from './lib/anthropic.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, '../../.env') });

const CACHE_DIR = path.join(__dirname, 'cache');
const SAMPLE_OUT = path.join(CACHE_DIR, 'seed-samples-owens-and-lvc.json');

function sha1(s: string): string {
  return crypto.createHash('sha1').update(s).digest('hex');
}

function loadSummary(title: string): { extract?: string; description?: string } {
  const file = path.join(CACHE_DIR, 'wikipedia-summaries', `${sha1(title)}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

async function fetchFullExtract(title: string): Promise<string> {
  // Get the full intro section (plaintext) via MediaWiki extracts API.
  // Richer than the summary endpoint's first paragraph; better seed context.
  const safeTitle = encodeURIComponent(title);
  const url =
    `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&titles=${safeTitle}` +
    `&exintro=true&explaintext=true&format=json&redirects=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'XRoad-Region-Import/0.1 (john@example.com)' },
  });
  if (!res.ok) throw new Error(`extracts API HTTP ${res.status}`);
  const json = (await res.json()) as {
    query: { pages: Record<string, { extract?: string }> };
  };
  const pages = Object.values(json.query.pages);
  return pages[0]?.extract ?? '';
}

async function generateSample(regionName: string, articleTitle: string): Promise<{
  regionName: string;
  articleTitle: string;
  sourceContext: string;
  sourceLength: number;
  seedText: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}> {
  // Try the richer extracts endpoint; fall back to cached summary if it fails.
  let sourceContext: string;
  try {
    sourceContext = await fetchFullExtract(articleTitle);
    if (sourceContext.length < 200) {
      // Too thin — augment with cached summary
      const summary = loadSummary(articleTitle);
      sourceContext = (summary.extract ?? '') + '\n\n' + sourceContext;
    }
  } catch (err) {
    console.warn(chalk.yellow(`  fetch-extract failed: ${(err as Error).message} — falling back to cached summary`));
    const summary = loadSummary(articleTitle);
    sourceContext = summary.extract ?? '';
  }

  const userPrompt = buildSeedTextUserPrompt(regionName, sourceContext);
  const resp = await callHaiku(SEED_TEXT_SYSTEM_PROMPT, userPrompt, regionName);
  return {
    regionName,
    articleTitle,
    sourceContext,
    sourceLength: sourceContext.length,
    seedText: resp.text,
    inputTokens: resp.inputTokens,
    outputTokens: resp.outputTokens,
    costUsd: resp.costUsd,
  };
}

async function main(): Promise<void> {
  console.log(chalk.bold('E1d Phase 3 — seed-text samples for tone-check\n'));

  const samples: Awaited<ReturnType<typeof generateSample>>[] = [];

  for (const [regionName, articleTitle] of [
    ['Owens Valley', 'Owens Valley'],
    ['Long Valley Caldera', 'Long Valley Caldera'],
  ] as const) {
    console.log(chalk.cyan(`Generating: ${regionName}`));
    const s = await generateSample(regionName, articleTitle);
    samples.push(s);
    console.log(chalk.gray(`  Source context: ${s.sourceLength} chars`));
    console.log(chalk.gray(`  Tokens: ${s.inputTokens}→${s.outputTokens}  Cost: $${s.costUsd.toFixed(5)}`));
    console.log('');
  }

  console.log(chalk.bold('═══════════════════════════════════════════════════════════════════'));
  console.log(chalk.bold('SEED-TEXT SAMPLES — review for tone'));
  console.log(chalk.bold('═══════════════════════════════════════════════════════════════════'));

  for (const s of samples) {
    console.log('');
    console.log(chalk.bold(`──── ${s.regionName} ────`));
    console.log('');
    console.log(s.seedText);
    console.log('');
    console.log(chalk.gray(`(${s.seedText.length} chars · ${s.outputTokens} tokens · $${s.costUsd.toFixed(5)})`));
  }

  console.log('');
  console.log(chalk.bold('───────────────────────────────────────────────────────────────────'));
  console.log(chalk.gray(`Total cost: $${samples.reduce((a, s) => a + s.costUsd, 0).toFixed(5)}`));

  fs.mkdirSync(path.dirname(SAMPLE_OUT), { recursive: true });
  fs.writeFileSync(SAMPLE_OUT, JSON.stringify({ generatedAt: new Date().toISOString(), samples }, null, 2));
  console.log(chalk.gray(`JSON: ${SAMPLE_OUT}`));
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(`Fatal: ${msg}`));
  process.exit(1);
});
