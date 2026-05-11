// One-off backfill: re-classify existing pois rows whose tags now route to
// new poi_categories slugs after Prompt 06's category-map.ts widening.
//
// Audit: docs/audit-poi-categories.md "Follow-up tasks" §2
//
// Run from repo root:
//   node scripts/poi-import/backfill-category-reclassify.mjs --dry-run
//   node scripts/poi-import/backfill-category-reclassify.mjs
//   node scripts/poi-import/backfill-category-reclassify.mjs --apply

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(__dirname, '../../.env') });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || (!args.includes('--apply') && !args.length === false);
// Default to dry-run unless --apply is explicit.
const apply = args.includes('--apply');

const RULES = [
  { from: 'architecture', to: 'bridges',     tag: 'bridge'    },
  { from: 'architecture', to: 'dams',        tag: 'dam'       },
  { from: 'nature',       to: 'hot_springs', tag: 'hot_spring'},
  { from: 'nature',       to: 'volcanic',    tag: 'volcano'   },
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log('');

  const totals = {};

  for (const r of RULES) {
    // Preview: count rows that would be affected
    const preview = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM pois p
         JOIN poi_categories pc_from ON p.category_id = pc_from.id
        WHERE pc_from.slug = $1
          AND p.merged_into IS NULL
          AND $2 = ANY(p.tags)`,
      [r.from, r.tag],
    );
    const candidateCount = preview.rows[0].n;
    console.log(`[${r.from} → ${r.to}] tag='${r.tag}': ${candidateCount} candidate row(s)`);

    if (!apply) {
      totals[r.to] = candidateCount;
      continue;
    }

    const result = await pool.query(
      `UPDATE pois
          SET category_id = (SELECT id FROM poi_categories WHERE slug = $2)
        WHERE category_id = (SELECT id FROM poi_categories WHERE slug = $1)
          AND merged_into IS NULL
          AND $3 = ANY(tags)
        RETURNING id`,
      [r.from, r.to, r.tag],
    );
    console.log(`   ✓ updated ${result.rowCount} row(s)`);
    totals[r.to] = result.rowCount;
  }

  console.log('\n=== Summary ===');
  for (const [slug, n] of Object.entries(totals)) {
    console.log(`  ${slug.padEnd(14)} ${n}`);
  }

  if (apply) {
    console.log('\n=== Post-state (active row counts for affected slugs) ===');
    const post = await pool.query(
      `SELECT pc.slug, COUNT(p.id)::int AS count
         FROM poi_categories pc
         LEFT JOIN pois p ON p.category_id = pc.id AND p.merged_into IS NULL
        WHERE pc.slug IN ('architecture','bridges','dams','nature','hot_springs','volcanic')
        GROUP BY pc.slug
        ORDER BY pc.slug`,
    );
    for (const row of post.rows) {
      console.log(`  ${row.slug.padEnd(14)} ${row.count}`);
    }
  }
}

main()
  .catch((err) => {
    console.error('ERROR:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
