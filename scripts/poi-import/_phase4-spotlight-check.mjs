// Spotlight check after Phase 4 dedup commit.
// Looks for Star of India, Old Point Loma Lighthouse, Cabrillo NM,
// the 8 still-split missions, and Disneyland/Universal anchor venues.

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function lookup(label, sql, params = []) {
  console.log(`\n=== ${label} ===`);
  const r = await pool.query(sql, params);
  if (r.rows.length === 0) {
    console.log('  (no rows)');
    return;
  }
  for (const row of r.rows) {
    const score = row.significance_score != null ? Number(row.significance_score).toFixed(1) : '-';
    const merged = row.merged_into ? `MERGED → ${row.merged_into}` : 'active';
    const is_v = row.is_venue ? 'V' : '-';
    const parent = row.parent_poi_id ? `child of ${row.parent_poi_id}` : '-';
    console.log(`  ${row.id}  [${row.source_type}]  score=${score}  ${is_v}  ${merged}  ${parent}`);
    console.log(`    name: ${row.name}`);
    console.log(`    cat:  ${row.cat ?? '-'}     additional_sources: ${row.additional_sources ? row.additional_sources.length : 0}`);
  }
}

async function main() {
  await lookup('Star of India',
    `SELECT p.id::text, p.name, p.source_type, p.significance_score,
            p.merged_into::text AS merged_into, p.is_venue,
            p.parent_poi_id::text AS parent_poi_id,
            c.slug AS cat, p.additional_sources
       FROM pois p
       LEFT JOIN poi_categories c ON c.id = p.category_id
      WHERE name ILIKE '%star of india%'`);

  await lookup('Old Point Loma Lighthouse',
    `SELECT p.id::text, p.name, p.source_type, p.significance_score,
            p.merged_into::text AS merged_into, p.is_venue,
            p.parent_poi_id::text AS parent_poi_id,
            c.slug AS cat, p.additional_sources
       FROM pois p
       LEFT JOIN poi_categories c ON c.id = p.category_id
      WHERE name ILIKE '%point loma%lighthouse%' OR name ILIKE '%old point loma%'`);

  await lookup('Cabrillo National Monument',
    `SELECT p.id::text, p.name, p.source_type, p.significance_score,
            p.merged_into::text AS merged_into, p.is_venue,
            p.parent_poi_id::text AS parent_poi_id,
            c.slug AS cat, p.additional_sources
       FROM pois p
       LEFT JOIN poi_categories c ON c.id = p.category_id
      WHERE name ILIKE '%cabrillo%' AND (name ILIKE '%monument%' OR name ILIKE '%national%')`);

  await lookup('All Mission rows still active (looking for the 8 still-split)',
    `SELECT p.id::text, p.name, p.source_type, p.significance_score,
            p.merged_into::text AS merged_into, p.is_venue,
            p.parent_poi_id::text AS parent_poi_id,
            c.slug AS cat, p.additional_sources
       FROM pois p
       LEFT JOIN poi_categories c ON c.id = p.category_id
      WHERE name ILIKE 'mission %'
        AND merged_into IS NULL
      ORDER BY name`);

  await lookup('Disneyland Park anchor',
    `SELECT p.id::text, p.name, p.source_type, p.significance_score,
            p.merged_into::text AS merged_into, p.is_venue,
            p.parent_poi_id::text AS parent_poi_id,
            c.slug AS cat, p.additional_sources
       FROM pois p
       LEFT JOIN poi_categories c ON c.id = p.category_id
      WHERE name = 'Disneyland Park' OR name = 'Disneyland'
      ORDER BY p.is_venue DESC, p.significance_score DESC`);

  await lookup('Universal Studios Hollywood anchor',
    `SELECT p.id::text, p.name, p.source_type, p.significance_score,
            p.merged_into::text AS merged_into, p.is_venue,
            p.parent_poi_id::text AS parent_poi_id,
            c.slug AS cat, p.additional_sources
       FROM pois p
       LEFT JOIN poi_categories c ON c.id = p.category_id
      WHERE name ILIKE 'universal studios hollywood%'
      ORDER BY p.is_venue DESC, p.significance_score DESC`);

  await lookup('Six Flags Discovery Kingdom (expected merged into Marine World/Africa USA?)',
    `SELECT p.id::text, p.name, p.source_type, p.significance_score,
            p.merged_into::text AS merged_into, p.is_venue,
            p.parent_poi_id::text AS parent_poi_id,
            c.slug AS cat, p.additional_sources
       FROM pois p
       LEFT JOIN poi_categories c ON c.id = p.category_id
      WHERE p.id::text = '11b6adba-1f87-4b63-9003-74f9f347c231'
         OR p.id::text = '4027f0f8-b280-4ec2-bf56-ee937eb826ec'`);
}

main()
  .catch((err) => { console.error('ERROR:', err.message ?? err); process.exitCode = 1; })
  .finally(() => pool.end());
