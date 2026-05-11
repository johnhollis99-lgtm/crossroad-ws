// Diagnostic: show the category-slug distribution for a list of POI tag
// values, then run a name-pattern fallback check for volcanoes
// miscategorized as `nature/summit`. Edit the tag list at the top of
// main() and/or the trailing name-pattern query to retarget.
// Read-only. No DB writes.
//
// Created: 2026-05-11 (Prompt 07 backfill investigation — caught the
// pre-Prompt-06 `natural=peak|volcano` bundled-rule side-effect where
// ~150+ Wikidata volcanoes ended up in `nature` with `'summit'` tag,
// invisible to a tag-based backfill).
// Retention: keep — useful for any "where did this tag end up?" question.
//
// Run from repo root:
//   node scripts/poi-import/diag/check-tags.mjs

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';
const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
async function main() {
  for (const tag of ['hot_spring','geyser','volcano']) {
    const r = await pool.query(
      `SELECT pc.slug, COUNT(*)::int AS n
         FROM pois p JOIN poi_categories pc ON p.category_id = pc.id
        WHERE p.merged_into IS NULL AND $1 = ANY(p.tags)
        GROUP BY pc.slug ORDER BY n DESC`,
      [tag],
    );
    console.log(`tag='${tag}':`);
    for (const row of r.rows) console.log(`  ${row.slug.padEnd(16)} ${row.n}`);
    if (r.rows.length === 0) console.log('  (no active rows with this tag)');
  }
  // Show some volcano-like names that may be miscategorized
  console.log('\nNames with "Volcano" in nature slug:');
  const v = await pool.query(
    `SELECT p.name, p.tags, p.source_type, p.source_id
       FROM pois p JOIN poi_categories pc ON p.category_id = pc.id
      WHERE pc.slug = 'nature' AND p.merged_into IS NULL
        AND p.name ILIKE '%volcano%'
      ORDER BY random() LIMIT 8`,
  );
  for (const row of v.rows) {
    console.log(`  [${row.source_type}/${row.source_id}] "${row.name}" tags=${JSON.stringify(row.tags)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => pool.end());
