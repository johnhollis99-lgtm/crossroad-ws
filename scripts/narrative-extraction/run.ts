#!/usr/bin/env node
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import chalk from 'chalk';

import * as wpaGuide from './sources/wpa-guide.js';
import * as bancroft from './sources/bancroft.js';
import * as cdnc     from './sources/cdnc.js';

import type { IngestOptions, IngestResult, SourceName } from './lib/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DEFAULT_CACHE_DIR = path.join(__dirname, 'cache');

const SOURCES: Record<string, (opts: IngestOptions) => Promise<IngestResult>> = {
  'wpa-guide': wpaGuide.runIngest,
  'bancroft':  bancroft.runIngest,
  'cdnc':      cdnc.runIngest,
};

type SourceKey = keyof typeof SOURCES;

function summarize(results: IngestResult[]): void {
  console.log('');
  console.log(chalk.bold('── Ingest summary ──────────────────────────────────'));
  for (const r of results) {
    console.log(
      `  ${chalk.cyan(r.source.padEnd(20))} ` +
      `sections=${r.sections} chunks=${r.chunks} ` +
      `inserted=${r.inserted} ` +
      `errors=${r.errors > 0 ? chalk.red(String(r.errors)) : r.errors} ` +
      `(${r.durationMs}ms)`,
    );
  }
}

const program = new Command();

program
  .name('xroad-narrative-extraction')
  .description('Historical text corpus ingestion for XRoad narrative extraction')
  .version('0.1.0');

program
  .command('ingest')
  .description('Run one or more source ingesters')
  .requiredOption(
    '-s, --source <names>',
    `Comma-separated source list or "all". Available: ${Object.keys(SOURCES).join(', ')}`,
  )
  .option('--dry-run',        'Fetch and chunk but do not write to DB', false)
  .option('--force',          'Bypass download cache; re-fetch source data', false)
  .option('--limit <n>',      'Cap sections/articles per source (for testing)', (v) => Number(v))
  .option('--cache-dir <dir>', 'Override cache directory', DEFAULT_CACHE_DIR)
  .action(async (cliOpts: {
    source:   string;
    dryRun:   boolean;
    force:    boolean;
    limit?:   number;
    cacheDir: string;
  }) => {
    const requested: SourceKey[] =
      cliOpts.source === 'all'
        ? (Object.keys(SOURCES) as SourceKey[])
        : (cliOpts.source.split(',').map((s) => s.trim()) as SourceKey[]);

    for (const s of requested) {
      if (!(s in SOURCES)) {
        console.error(
          chalk.red(`Unknown source "${s}". Available: ${Object.keys(SOURCES).join(', ')}`),
        );
        process.exit(1);
      }
    }

    const opts: IngestOptions = {
      cacheDir: path.resolve(cliOpts.cacheDir),
      dryRun:   cliOpts.dryRun,
      force:    cliOpts.force,
      limit:    cliOpts.limit,
    };

    console.log(chalk.bold(`XRoad narrative extraction — sources: ${requested.join(', ')}`));
    if (opts.dryRun) console.log(chalk.yellow('DRY RUN — no DB writes'));

    const results: IngestResult[] = [];
    for (const key of requested) {
      try {
        const r = await SOURCES[key]!(opts);
        results.push(r);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`[${key}] failed: ${msg}`));
        results.push({
          source:    key as SourceName,
          sections:  0,
          chunks:    0,
          inserted:  0,
          errors:    1,
          durationMs: 0,
        });
      }
    }

    summarize(results);
    process.exit(results.some((r) => r.errors > 0) ? 1 : 0);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
