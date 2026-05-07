#!/usr/bin/env node
// One-off applier for migration 20260504000016_venue_tour_schema.sql.
// Wraps the entire migration in a transaction; rolls back on any error.

import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, '../../.env') });

import { promises as fs } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { getPgPool } from '../poi-import/lib/supabase.js';

async function main() {
  const filename = process.argv[2] ?? '20260504000016_venue_tour_schema.sql';
  const sqlPath = path.resolve(__dirname, '..', '..', 'supabase', 'migrations', filename);
  const sql = await fs.readFile(sqlPath, 'utf8');
  console.log(chalk.cyan(`Applying ${filename} (${sql.length} chars)…`));

  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log(chalk.green(`✓ Applied ${filename}`));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(chalk.red(`✗ Migration failed: ${(err as Error).message}`));
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
