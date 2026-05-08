// One-off: audit + dedupe duplicate entries in pois.additional_sources arrays
// (residue from pre-Phase B/C alreadySecondary fix). Captures which rows were
// touched + their ids so a downstream scoped recompute can run.
//
// Run from: scripts/poi-import/
//   node dedupe-additional-sources.mjs

import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(__dirname, '../../.env') });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

const FIND_DUPES_SQL = `
  SELECT id::text,
         name,
         additional_sources,
         array_length(additional_sources, 1)                              AS total_entries,
         (SELECT COUNT(DISTINCT v) FROM unnest(additional_sources) v)::int AS distinct_entries
  FROM pois
  WHERE merged_into IS NULL
    AND additional_sources IS NOT NULL
    AND array_length(additional_sources, 1) >
        (SELECT COUNT(DISTINCT v) FROM unnest(additional_sources) v)
  ORDER BY (array_length(additional_sources, 1) -
            (SELECT COUNT(DISTINCT v) FROM unnest(additional_sources) v)) DESC,
           name`;

const DEDUPE_SQL = `
  UPDATE pois
  SET additional_sources = (
    SELECT array_agg(DISTINCT v ORDER BY v)
    FROM unnest(additional_sources) v
  )
  WHERE merged_into IS NULL
    AND additional_sources IS NOT NULL
    AND array_length(additional_sources, 1) >
        (SELECT COUNT(DISTINCT v) FROM unnest(additional_sources) v)
  RETURNING id::text`;

async function main() {
  console.log('▶ 3.1 — finding rows with duplicate additional_sources entries\n');
  const before = await pool.query(FIND_DUPES_SQL);
  if (before.rowCount === 0) {
    console.log('  (no duplicates found — nothing to do)');
    return;
  }
  console.log(`  Found ${before.rowCount} rows with duplicate entries:\n`);
  for (const row of before.rows) {
    const dupes = row.total_entries - row.distinct_entries;
    console.log(
      `  ${row.id}  ${row.name?.padEnd(40).slice(0, 40) ?? '(unnamed)'.padEnd(40)}  ` +
      `total=${row.total_entries}  distinct=${row.distinct_entries}  ` +
      `dupes=${dupes}`,
    );
    console.log(`      additional_sources=${JSON.stringify(row.additional_sources)}`);
  }

  console.log('\n▶ 3.2 — deduplicating in a transaction');
  const client = await pool.connect();
  let touchedIds = [];
  try {
    await client.query('BEGIN');
    const res = await client.query(DEDUPE_SQL);
    touchedIds = res.rows.map((r) => r.id);
    await client.query('COMMIT');
    console.log(`  ✓ committed; ${touchedIds.length} rows updated`);
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    throw err;
  }
  client.release();

  console.log('\n▶ 3.3 — verify (re-running 3.1 query)');
  const after = await pool.query(FIND_DUPES_SQL);
  console.log(`  Rows with duplicates after dedupe: ${after.rowCount}  (expected 0)`);
  if (after.rowCount !== 0) {
    console.error('  ! verification failed — duplicates still present');
    process.exitCode = 2;
    return;
  }

  console.log('\n▶ 3.4 — touched ids for recompute scope:');
  console.log(touchedIds.join(','));

  // Also write to a sidecar file so the recompute step is easy to run.
  const idsFile = resolve(__dirname, 'cache', 'dedupe-additional-sources-ids.txt');
  const fs = await import('node:fs/promises');
  await fs.mkdir(dirname(idsFile), { recursive: true });
  await fs.writeFile(idsFile, touchedIds.join(','), 'utf8');
  console.log(`  (also written to: ${idsFile})`);
}

main()
  .catch((err) => {
    console.error('ERROR:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
