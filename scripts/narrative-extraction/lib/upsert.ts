import chalk from 'chalk';
import { getAdminClient } from './supabase.js';
import type { DocumentChunk } from './types.js';

const BATCH_SIZE = 500;

export interface UpsertOutcome {
  inserted: number;
  errors:   number;
}

interface DbRow {
  source:      string;
  title:       string;
  date:        string | null;
  url:         string;
  full_text:   string | null;
  chunk_index: number;
  chunk_text:  string;
}

function batched<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function upsertChunks(
  chunks:  DocumentChunk[],
  dryRun:  boolean,
): Promise<UpsertOutcome> {
  const outcome: UpsertOutcome = { inserted: 0, errors: 0 };
  if (chunks.length === 0) return outcome;

  if (dryRun) {
    console.log(chalk.cyan(`[upsert] DRY RUN — would upsert ${chunks.length} chunks`));
    for (const c of chunks.slice(0, 3)) {
      console.log(chalk.gray(`  • [${c.source}] "${c.title}" chunk ${c.chunk_index} (${c.chunk_text.length} chars)`));
    }
    if (chunks.length > 3) console.log(chalk.gray(`  …and ${chunks.length - 3} more`));
    return outcome;
  }

  const supabase = getAdminClient();

  const rows: DbRow[] = chunks.map((c) => ({
    source:      c.source,
    title:       c.title,
    date:        c.date ? c.date.toISOString().split('T')[0]! : null,
    url:         c.url,
    full_text:   c.full_text ?? null,
    chunk_index: c.chunk_index,
    chunk_text:  c.chunk_text,
  }));

  for (const batch of batched(rows, BATCH_SIZE)) {
    const { data, error } = await supabase
      .from('narrative_documents')
      .upsert(batch, { onConflict: 'source,url,chunk_index' })
      .select('id');

    if (error) {
      console.error(chalk.red(`[upsert] batch error: ${error.message}`));
      outcome.errors += batch.length;
    } else {
      const n = data?.length ?? 0;
      outcome.inserted += n;
      console.log(chalk.green(`[upsert] batch ok — ${n} rows`));
    }
  }

  return outcome;
}
