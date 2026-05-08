// Manually merge wikidata twins into their editorial venue parent.
// Editorial wins primary regardless of source priority — editorial venues
// are by definition the curated canonical row.
//
// Operations per pair (single transaction across all pairs):
//   1. UPDATE wikidata row: SET merged_into = editorial.id
//   2. UPDATE editorial venue: append 'wikidata:Qxxx' to additional_sources
//      (idempotent — skip if already present)
//
// Run from: scripts/poi-import/
//   node commit-wikidata-twin-merges.mjs

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  const candidates = (await pool.query(`
    WITH editorial_with_wikidata AS (
      SELECT id AS venue_id, name AS venue_name,
             venue_metadata->>'wikidata' AS q_number,
             additional_sources
      FROM pois
      WHERE source_type = 'editorial'
        AND merged_into IS NULL
        AND venue_metadata ? 'wikidata'
        AND venue_metadata->>'wikidata' LIKE 'Q%'
        AND venue_metadata->>'wikidata' NOT LIKE 'Q-VERIFY%'
        AND venue_metadata->>'wikidata' NOT LIKE 'Q-REAL%'
    )
    SELECT
      e.venue_id::text     AS venue_id,
      e.venue_name,
      e.q_number,
      e.additional_sources,
      w.id::text           AS wikidata_id,
      w.name               AS wikidata_name
    FROM editorial_with_wikidata e
    JOIN pois w
      ON w.source_type = 'wikidata'
     AND w.source_id   = e.q_number
     AND w.merged_into IS NULL
     AND w.id <> e.venue_id
    ORDER BY e.venue_name
  `)).rows;

  console.log(`Found ${candidates.length} pair(s) to merge\n`);

  if (candidates.length === 0) {
    console.log('Nothing to do.');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const committed = [];
    for (const c of candidates) {
      const tag = `wikidata:${c.q_number}`;
      const already = (c.additional_sources ?? []).includes(tag);

      // Soft-delete the wikidata row
      const w = await client.query(
        `UPDATE pois SET merged_into = $1
          WHERE id = $2
            AND merged_into IS NULL
        RETURNING id::text, name`,
        [c.venue_id, c.wikidata_id],
      );
      if (w.rows.length !== 1) {
        throw new Error(`Failed to soft-delete wikidata row ${c.wikidata_id} (returning ${w.rows.length} rows)`);
      }

      // Idempotent append of additional_sources entry
      if (!already) {
        await client.query(
          `UPDATE pois
              SET additional_sources = COALESCE(additional_sources, ARRAY[]::text[]) || ARRAY[$2::text]
            WHERE id = $1`,
          [c.venue_id, tag],
        );
      }

      committed.push({ ...c, alreadyTagged: already });
      console.log(`  ✓ "${c.venue_name}" (${c.venue_id}) absorbed wikidata "${c.wikidata_name}" (${c.wikidata_id})  ${already ? '[tag already present]' : '[tag appended]'}`);
    }
    await client.query('COMMIT');
    console.log(`\n✓ Committed ${committed.length} merges in a single transaction.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`\n✗ ROLLED BACK: ${err.message}`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error('FATAL:', err.message); process.exitCode = 1; });
