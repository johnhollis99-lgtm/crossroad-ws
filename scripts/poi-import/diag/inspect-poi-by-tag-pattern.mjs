// Diagnostic: for each (category-slug, tag) pair in RULES, print the
// source_type breakdown and 8 random sample rows of active POIs matching
// that pair. Use before any destructive operation that targets the same
// (slug, tag) shape — confirms what the rows actually are.
// Read-only. No DB writes.
//
// Created: 2026-05-11 (Prompt 07 backfill investigation — 1,642 dams
// surfaced unexpectedly when the audit estimated "~50–200"; this script
// confirmed they were all legitimate Wikidata Q12323 imports before the
// backfill ran).
// Retention: keep — generic enough to reuse on similar audits. Edit the
// RULES array at the top of main() to retarget.
//
// Run from repo root:
//   node scripts/poi-import/diag/inspect-poi-by-tag-pattern.mjs

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(__dirname, '../../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  const RULES = [
    { from: 'architecture', tag: 'bridge' },
    { from: 'architecture', tag: 'dam'    },
    { from: 'nature',       tag: 'hot_spring' },
    { from: 'nature',       tag: 'volcano'    },
  ];

  for (const r of RULES) {
    console.log(`\n### ${r.from} + tag='${r.tag}' ###`);

    // Source_type breakdown
    const st = await pool.query(
      `SELECT p.source_type, COUNT(*)::int AS n
         FROM pois p
         JOIN poi_categories pc ON p.category_id = pc.id
        WHERE pc.slug = $1 AND p.merged_into IS NULL AND $2 = ANY(p.tags)
        GROUP BY p.source_type ORDER BY n DESC`,
      [r.from, r.tag],
    );
    console.log(`source_type breakdown:`);
    for (const row of st.rows) {
      console.log(`  ${String(row.source_type).padEnd(20)} ${row.n}`);
    }

    // Sample 8 random rows
    const sample = await pool.query(
      `SELECT p.id, p.name, p.source_type, p.source_id, p.tags
         FROM pois p
         JOIN poi_categories pc ON p.category_id = pc.id
        WHERE pc.slug = $1 AND p.merged_into IS NULL AND $2 = ANY(p.tags)
        ORDER BY random()
        LIMIT 8`,
      [r.from, r.tag],
    );
    console.log(`8 random samples:`);
    for (const row of sample.rows) {
      const tagStr = JSON.stringify(row.tags);
      console.log(`  [${row.source_type}/${row.source_id}] "${row.name}" tags=${tagStr}`);
    }
  }
}

main()
  .catch((err) => {
    console.error('ERROR:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
