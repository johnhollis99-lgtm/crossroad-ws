// Diagnostic: print 5 random POIs per category slug with name, source,
// tags, and citation (first 140 chars). Used to spot-check the output of
// a backfill or fresh import — quick "do these look right?" pass.
// Read-only. No DB writes.
//
// Created: 2026-05-11 (Prompt 07 backfill investigation — confirmed the
// 24 architecture→bridges + 1,642 architecture→dams reclassifications
// were correctly targeted before sign-off).
// Retention: keep — generic enough to reuse on similar audits. Edit the
// slug array in main() to retarget.
//
// Run from repo root:
//   node scripts/poi-import/diag/spotcheck-backfill.mjs

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';
const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
async function main() {
  for (const slug of ['bridges','dams']) {
    console.log(`\n=== Spot-check 5 random in '${slug}' ===`);
    const r = await pool.query(
      `SELECT p.id, p.name, p.source_type, p.source_id, p.tags, p.source_citation
         FROM pois p JOIN poi_categories pc ON p.category_id = pc.id
        WHERE pc.slug = $1 AND p.merged_into IS NULL
        ORDER BY random() LIMIT 5`,
      [slug],
    );
    for (const row of r.rows) {
      console.log(`  [${row.source_type}/${row.source_id}] "${row.name}"`);
      console.log(`    tags=${JSON.stringify(row.tags)}`);
      if (row.source_citation) {
        const sc = String(row.source_citation).slice(0, 140);
        console.log(`    citation=${sc}`);
      }
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => pool.end());
