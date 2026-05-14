#!/usr/bin/env node
/**
 * CLI for the region-import pipeline.
 *
 * Loads .env from the repo root (../../.env) regardless of cwd, matching
 * the convention from scripts/poi-import/run.ts.
 */
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, '../../.env') });

import path from 'node:path';
import fs from 'node:fs';
import { Command } from 'commander';
import chalk from 'chalk';

import * as usgs from './sources/usgs-provinces.js';
import * as epa from './sources/epa-ecoregions.js';
import * as nativeLand from './sources/native-land.js';
import * as namedValleys from './sources/named-valleys.js';

import type { ImportOptions, ImportResult } from './lib/types.js';

/**
 * Registered sources, in dependency order for "--source=all".
 *
 * usgs → epa: EPA ecoregions need USGS province rows present to resolve
 *             parent_region_id via ST_Within.
 *
 * native_land, named_valleys: order-independent w.r.t. each other and the
 *             other two.
 */
const SOURCES = {
  usgs:          usgs.runImport,
  epa:           epa.runImport,
  native_land:   nativeLand.runImport,
  named_valleys: namedValleys.runImport,
} as const;

type SourceKey = keyof typeof SOURCES;
const ALL_SOURCES = Object.keys(SOURCES) as SourceKey[];

const DEFAULT_CACHE_DIR = path.join(__dirname, 'cache');

function summarize(results: ImportResult[]): void {
  console.log('');
  console.log(chalk.bold('── Region import summary ──────────────'));
  for (const r of results) {
    console.log(
      `  ${chalk.cyan(r.source.padEnd(18))} ` +
      `fetched=${r.fetched} normalized=${r.normalized} ` +
      `inserted=${r.inserted} updated=${r.updated} ` +
      `skipped=${r.skipped} review=${r.reviewQueueEntries} ` +
      `errors=${chalk.red(String(r.errors))} ` +
      `(${r.durationMs}ms)`,
    );
  }
  const totals = results.reduce(
    (acc, r) => {
      acc.fetched += r.fetched;
      acc.inserted += r.inserted;
      acc.updated += r.updated;
      acc.review += r.reviewQueueEntries;
      acc.errors += r.errors;
      return acc;
    },
    { fetched: 0, inserted: 0, updated: 0, review: 0, errors: 0 },
  );
  console.log(
    `  ${chalk.bold('TOTAL'.padEnd(18))} ` +
    `fetched=${totals.fetched} inserted=${totals.inserted} ` +
    `updated=${totals.updated} review=${totals.review} ` +
    `errors=${chalk.red(String(totals.errors))}`,
  );
}

function writeRunSummary(cacheDir: string, results: ImportResult[]): void {
  fs.mkdirSync(cacheDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(cacheDir, `regions-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2));
  console.log(chalk.gray(`  Run summary: ${file}`));
}

const program = new Command();

program
  .name('xroad-region-import')
  .description('Region ingestion pipeline for XRoad (Phase E1 of roadstory-unified-roadmap.md)')
  .version('0.1.0');

program
  .command('import')
  .description('Run one or more region source importers')
  .requiredOption(
    '-s, --source <names>',
    `Comma-separated list, or "all". Available: ${ALL_SOURCES.join(', ')}`,
  )
  .option('--dry-run', 'Fetch + normalize but do not write to DB', false)
  .option('--force', 'Bypass cache; re-download source data', false)
  .option('--cache-dir <path>', 'Override cache directory', DEFAULT_CACHE_DIR)
  .action(async (cliOpts: {
    source: string;
    dryRun: boolean;
    force: boolean;
    cacheDir: string;
  }) => {
    const requested = cliOpts.source === 'all'
      ? ALL_SOURCES
      : (cliOpts.source.split(',').map((s) => s.trim()) as SourceKey[]);

    for (const s of requested) {
      if (!(s in SOURCES)) {
        console.error(chalk.red(`Unknown source "${s}". Available: ${ALL_SOURCES.join(', ')}`));
        process.exit(1);
      }
    }

    const opts: ImportOptions = {
      dryRun: cliOpts.dryRun,
      force: cliOpts.force,
      cacheDir: cliOpts.cacheDir,
    };
    fs.mkdirSync(opts.cacheDir, { recursive: true });

    console.log(chalk.bold(`\nRegion import — sources: ${requested.join(', ')}`));
    if (opts.dryRun) console.log(chalk.yellow('  [DRY RUN — no DB writes]'));
    if (opts.force)  console.log(chalk.yellow('  [FORCE — bypassing cache]'));

    const results: ImportResult[] = [];
    for (const s of requested) {
      console.log(chalk.bold(`\n→ ${s}`));
      const t0 = Date.now();
      try {
        const r = await SOURCES[s](opts);
        r.durationMs = Date.now() - t0;
        results.push(r);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`  ${s} failed: ${msg}`));
        // Continue with the next source — one bad importer shouldn't poison the run.
        // (Different from poi-import, which stops on error; region import is small
        // and the user wants to see partial progress.)
        results.push({
          source: s, fetched: 0, normalized: 0, inserted: 0, updated: 0,
          skipped: 0, errors: 1, reviewQueueEntries: 0,
          durationMs: Date.now() - t0,
        });
      }
    }

    summarize(results);
    writeRunSummary(opts.cacheDir, results);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(`Fatal: ${msg}`));
  process.exit(1);
});
