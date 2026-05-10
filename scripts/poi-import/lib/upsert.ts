import chalk from 'chalk';
import { getCategoryIdMap, getPgPool } from './supabase.js';
import type { NormalizedPOI } from './types.js';

const BATCH_SIZE = 100;

export interface UpsertOptions {
  dryRun: boolean;
}

export interface UpsertOutcome {
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
}

const COLS = [
  'name', 'category_id', 'location', 'tags', 'significance_score',
  'trip_mode', 'source_type', 'source_id', 'source_citation',
  'confidence_score', 'verified', 'description', 'imported_at',
  'venue_metadata',
] as const;

const N_COLS = COLS.length;

function toWKT(lat: number, lng: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function buildBatchSql(nRows: number): string {
  const valueClauses = Array.from({ length: nRows }, (_, rowIdx) => {
    const base = rowIdx * N_COLS;
    const params = COLS.map((col, colIdx) => {
      const p = `$${base + colIdx + 1}`;
      if (col === 'location') return `ST_GeogFromText(${p})`;
      if (col === 'venue_metadata') return `${p}::jsonb`;
      return p;
    });
    return `(${params.join(', ')})`;
  });

  // Don't clobber an existing venue_metadata on update — merge with EXCLUDED.
  // The importer only sets keys it owns (e.g. nrhp_*) so a sibling source
  // that wrote venue_metadata.wikidata stays intact.
  const updateCols = COLS.filter(c => c !== 'source_type' && c !== 'source_id');
  const updateSet = updateCols
    .map(c =>
      c === 'venue_metadata'
        ? `${c} = COALESCE(pois.${c}, '{}'::jsonb) || COALESCE(EXCLUDED.${c}, '{}'::jsonb)`
        : `${c} = EXCLUDED.${c}`,
    )
    .join(', ');

  return `
    INSERT INTO pois (${COLS.join(', ')})
    VALUES ${valueClauses.join(',\n    ')}
    ON CONFLICT (source_type, source_id) WHERE merged_into IS NULL DO UPDATE SET ${updateSet}
    RETURNING id, (xmax = 0) AS is_inserted
  `;
}

interface DbRow {
  name: string;
  category_id: string;
  location: string;
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
  venue_metadata: string | null;
}

function rowToParams(r: DbRow): unknown[] {
  return [
    r.name, r.category_id, r.location, r.tags, r.significance_score,
    r.trip_mode, r.source_type, r.source_id, r.source_citation,
    r.confidence_score, r.verified, r.description, r.imported_at,
    r.venue_metadata,
  ];
}

export async function upsertPOIs(
  rows: NormalizedPOI[],
  opts: UpsertOptions,
): Promise<UpsertOutcome> {
  const outcome: UpsertOutcome = { inserted: 0, updated: 0, skipped: 0, errors: 0 };
  if (rows.length === 0) return outcome;

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
      location: toWKT(r.lat, r.lng),
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
      venue_metadata: r.venue_metadata ? JSON.stringify(r.venue_metadata) : null,
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

  const pool = getPgPool();

  for (const batch of chunk(dbRows, BATCH_SIZE)) {
    const seen = new Map(batch.map(r => [`${r.source_type}:${r.source_id}`, r]));
    if (seen.size < batch.length) {
      console.warn(chalk.yellow(`[upsert] batch had ${batch.length - seen.size} duplicate keys, deduplicated`));
    }
    const deduped = [...seen.values()];
    const sql = buildBatchSql(deduped.length);
    const params = deduped.flatMap(rowToParams);
    try {
      const result = await pool.query<{ id: string; is_inserted: boolean }>(sql, params);
      const ins = result.rows.filter(r => r.is_inserted).length;
      const upd = result.rows.length - ins;
      outcome.inserted += ins;
      outcome.updated += upd;
      console.log(chalk.green(`[upsert] batch ok — ${ins} inserted, ${upd} updated`));
    } catch (err) {
      console.error(chalk.red(`[upsert] batch error: ${(err as Error).message}`));
      outcome.errors += batch.length;
    }
  }

  return outcome;
}
