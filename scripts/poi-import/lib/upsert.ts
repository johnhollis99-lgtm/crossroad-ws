import chalk from 'chalk';
import { getAdminClient, getCategoryIdMap } from './supabase.js';
import type { NormalizedPOI } from './types.js';

const BATCH_SIZE = 500;

export interface UpsertOptions {
  dryRun: boolean;
}

export interface UpsertOutcome {
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
}

interface DbRow {
  name: string;
  category_id: string;
  geom: string;
  tags: string[];
  significance_score: number;
  trip_mode: string;
  source_type: string;
  source_id: string;
  source_citation: string | null;
  confidence_score: number;
  verified: boolean;
  description: string | null;
  imported_at: string;
}

function toWKT(lat: number, lng: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function upsertPOIs(
  rows: NormalizedPOI[],
  opts: UpsertOptions,
): Promise<UpsertOutcome> {
  const outcome: UpsertOutcome = { inserted: 0, updated: 0, skipped: 0, errors: 0 };
  if (rows.length === 0) return outcome;

  const supabase = getAdminClient();
  const categoryIds = await getCategoryIdMap();

  const dbRows: DbRow[] = [];
  for (const r of rows) {
    const category_id = categoryIds[r.category_slug];
    if (!category_id) {
      console.warn(chalk.yellow(`[upsert] skipping ${r.name}: unknown category_slug "${r.category_slug}"`));
      outcome.skipped++;
      continue;
    }
    dbRows.push({
      name: r.name,
      category_id,
      geom: toWKT(r.lat, r.lng),
      tags: r.tags,
      significance_score: r.significance_score,
      trip_mode: r.trip_mode,
      source_type: r.source_type,
      source_id: r.source_id,
      source_citation: r.source_citation,
      confidence_score: r.confidence_score,
      verified: r.verified,
      description: r.description ?? null,
      imported_at: new Date().toISOString(),
    });
  }

  if (opts.dryRun) {
    console.log(chalk.cyan(`[upsert] DRY RUN — would upsert ${dbRows.length} rows`));
    for (const r of dbRows.slice(0, 3)) {
      console.log(chalk.gray(`  • ${r.name} [${r.source_type}:${r.source_id}]`));
    }
    if (dbRows.length > 3) console.log(chalk.gray(`  …and ${dbRows.length - 3} more`));
    outcome.skipped += dbRows.length;
    return outcome;
  }

  for (const batch of chunk(dbRows, BATCH_SIZE)) {
    const { data, error } = await supabase
      .from('pois')
      .upsert(batch, {
        onConflict: 'source_type,source_id',
        ignoreDuplicates: false,
      })
      .select('id, imported_at');

    if (error) {
      console.error(chalk.red(`[upsert] batch error: ${error.message}`));
      outcome.errors += batch.length;
      continue;
    }
    const affected = data?.length ?? 0;
    outcome.inserted += affected;
    console.log(chalk.green(`[upsert] batch ok — ${affected} rows`));
  }

  return outcome;
}
