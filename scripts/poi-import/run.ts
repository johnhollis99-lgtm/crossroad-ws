#!/usr/bin/env node
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, '../../.env') });

import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';

import * as osm from './sources/osm.js';
import * as wikidata from './sources/wikidata.js';
import * as nrhp from './sources/nrhp.js';
import * as caLandmarks from './sources/ca-landmarks.js';
import * as gnis from './sources/gnis.js';

import type { BoundingBox, ImportOptions, ImportResult, SourceType } from './lib/types.js';

const SOURCES = {
  osm: osm.runImport,
  wikidata: wikidata.runImport,
  nrhp: nrhp.runImport,
  'ca-landmarks': caLandmarks.runImport,
  gnis: gnis.runImport,
} as const;

type SourceKey = keyof typeof SOURCES;

const DEFAULT_CACHE_DIR = path.join(__dirname, 'cache');

function parseBBox(s: string): BoundingBox {
  const parts = s.split(',').map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    throw new Error(`Invalid --bbox "${s}". Expected "minLat,minLon,maxLat,maxLon".`);
  }
  const [minLat, minLon, maxLat, maxLon] = parts as [number, number, number, number];
  if (minLat >= maxLat || minLon >= maxLon) {
    throw new Error(`Invalid --bbox: min must be < max.`);
  }
  return { minLat, minLon, maxLat, maxLon };
}

function summarize(results: ImportResult[]): void {
  console.log('');
  console.log(chalk.bold('── Import summary ──────────────────'));
  for (const r of results) {
    console.log(
      `  ${chalk.cyan(r.source.padEnd(20))} ` +
      `fetched=${r.fetched} normalized=${r.normalized} ` +
      `inserted=${r.inserted} updated=${r.updated} ` +
      `skipped=${r.skipped} errors=${chalk.red(String(r.errors))} ` +
      `(${r.durationMs}ms)`,
    );
  }
}

const program = new Command();

program
  .name('xroad-poi-import')
  .description('Multi-source POI ingestion pipeline for XRoad')
  .version('0.1.0');

program
  .command('import')
  .description('Run one or more source importers')
  .requiredOption(
    '-s, --source <names>',
    `Comma-separated source list. Available: ${Object.keys(SOURCES).join(', ')}, or "all"`,
  )
  .option('-b, --bbox <minLat,minLon,maxLat,maxLon>', 'Bounding box filter')
  .option('-c, --county <name>', 'County name filter (source-specific)')
  .option('-S, --state <code>', 'Two-letter US state code, e.g. CA')
  .option('-l, --limit <n>', 'Cap rows fetched per source', (v) => Number(v))
  .option('--dry-run', 'Fetch + normalize but do not write to DB', false)
  .option('--force', 'Bypass cache; re-download source data', false)
  .option('--cache-dir <path>', 'Override cache directory', DEFAULT_CACHE_DIR)
  .action(async (cliOpts: {
    source: string;
    bbox?: string;
    county?: string;
    state?: string;
    limit?: number;
    dryRun: boolean;
    force: boolean;
    cacheDir: string;
  }) => {
    const requested = cliOpts.source === 'all'
      ? (Object.keys(SOURCES) as SourceKey[])
      : (cliOpts.source.split(',').map((s) => s.trim()) as SourceKey[]);

    for (const s of requested) {
      if (!(s in SOURCES)) {
        console.error(chalk.red(`Unknown source "${s}". Available: ${Object.keys(SOURCES).join(', ')}`));
        process.exit(1);
      }
    }

    const opts: ImportOptions = {
      bbox: cliOpts.bbox ? parseBBox(cliOpts.bbox) : undefined,
      county: cliOpts.county,
      state: cliOpts.state,
      limit: cliOpts.limit,
      dryRun: cliOpts.dryRun,
      force: cliOpts.force,
      cacheDir: path.resolve(cliOpts.cacheDir),
    };

    console.log(chalk.bold(`XRoad POI import — sources: ${requested.join(', ')}`));
    if (opts.dryRun) console.log(chalk.yellow('DRY RUN — no DB writes'));

    const results: ImportResult[] = [];
    for (const key of requested) {
      try {
        const r = await SOURCES[key](opts);
        results.push(r);
      } catch (err) {
        console.error(chalk.red(`[${key}] failed: ${(err as Error).message}`));
        results.push({
          source: key as SourceType,
          fetched: 0, normalized: 0, inserted: 0, updated: 0,
          skipped: 0, errors: 1, durationMs: 0,
        });
      }
    }

    summarize(results);
    const failed = results.some((r) => r.errors > 0);
    process.exit(failed ? 1 : 0);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
