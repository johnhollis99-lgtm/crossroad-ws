#!/usr/bin/env node
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, '../../.env') });

import chalk from 'chalk';
import { getPgPool } from '../poi-import/lib/supabase.js';

async function main() {
  const pool = getPgPool();
  const cols = await pool.query<{ column_name: string; data_type: string }>(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pois'
      AND column_name IN ('parent_poi_id','is_venue','venue_polygon','venue_type','venue_metadata')
    ORDER BY column_name
  `);
  console.log(chalk.bold('pois venue columns:'));
  for (const c of cols.rows) console.log(`  ${c.column_name.padEnd(16)} ${c.data_type}`);

  const constraints = await pool.query<{ conname: string }>(`
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'pois'::regclass
      AND conname IN ('venue_type_valid','venue_polygon_requires_is_venue','venue_type_requires_is_venue','child_cannot_be_venue')
    ORDER BY conname
  `);
  console.log(chalk.bold('pois constraints:'));
  for (const c of constraints.rows) console.log(`  ✓ ${c.conname}`);

  const tab = await pool.query<{ tablename: string }>(`
    SELECT tablename FROM pg_tables
    WHERE schemaname='public' AND tablename='venue_classification_review'
  `);
  console.log(chalk.bold('review table:'));
  console.log(tab.rows[0] ? `  ✓ venue_classification_review` : `  ✗ MISSING`);

  const fns = await pool.query<{ proname: string; sig: string }>(`
    SELECT proname, oid::regprocedure::text AS sig
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('get_venue_tour_pois','detect_venue_at_location','get_nearby_pois')
    ORDER BY proname
  `);
  console.log(chalk.bold('RPCs:'));
  for (const f of fns.rows) console.log(`  ✓ ${f.sig}`);

  const idx = await pool.query<{ indexname: string }>(`
    SELECT indexname FROM pg_indexes
    WHERE tablename='pois'
      AND indexname IN ('idx_pois_parent_poi_id','idx_pois_is_venue','idx_pois_venue_polygon','idx_pois_venue_type')
    ORDER BY indexname
  `);
  console.log(chalk.bold('indexes:'));
  for (const i of idx.rows) console.log(`  ✓ ${i.indexname}`);

  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
