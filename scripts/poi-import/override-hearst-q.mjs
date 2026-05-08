// Item A: Hearst SSSHM manual Q-override — adds q_match_method/q_match_note
// metadata flags so future audit/recompute hooks can distinguish a deliberate
// manual override from "audit hasn't seen this row yet".
//
// Q378143 (= Hearst Castle on enwiki) is the same real-world entity even
// though the venue name is "Hearst San Simeon State Historical Monument" —
// the audit's name-match gate rejected at ratio=0.20.
//
// Run from: scripts/poi-import/
//   node override-hearst-q.mjs

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const HEARST_SSSHM_ID = '6158a6b0-dda8-4efe-b7e2-61317ec76b2e';
const Q                = 'Q378143';
const NOTE             =
  'name-match gate ratio 0.20; venue "Hearst SSSHM" vs ' +
  'enwiki "Hearst Castle"; same real entity, override accepted';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function fetchState(client) {
  const r = await client.query(
    `SELECT name,
            venue_metadata->>'wikidata' AS qid,
            venue_metadata->>'q_match_method' AS q_match_method,
            venue_metadata->>'q_match_note' AS q_match_note,
            significance_score::float AS score,
            (significance_breakdown->>'pageviews')::int AS pv
     FROM pois WHERE id = $1`,
    [HEARST_SSSHM_ID],
  );
  return r.rows[0];
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('▶ BEFORE state\n');
    const before = await fetchState(client);
    console.log(`  name=${before?.name}`);
    console.log(`  qid=${before?.qid}  q_match_method=${before?.q_match_method ?? '—'}`);
    console.log(`  score=${before?.score}  pv=${before?.pv ?? '?'}`);
    console.log(`  q_match_note=${before?.q_match_note ?? '—'}`);

    console.log('\n▶ Applying UPDATE');
    await client.query('BEGIN');
    try {
      const r = await client.query(
        `UPDATE pois
         SET source_citation = $2,
             venue_metadata  = jsonb_set(jsonb_set(jsonb_set(
               venue_metadata,
               '{wikidata}', to_jsonb($3::text)),
               '{q_match_method}', to_jsonb('manual_override'::text)),
               '{q_match_note}', to_jsonb($4::text))
         WHERE id = $1`,
        [HEARST_SSSHM_ID, `https://www.wikidata.org/wiki/${Q}`, Q, NOTE],
      );
      console.log(`  rowCount=${r.rowCount}`);
      await client.query('COMMIT');
      console.log('  ✓ committed');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    console.log('\n▶ AFTER state (pre-recompute)\n');
    const after = await fetchState(client);
    console.log(`  name=${after?.name}`);
    console.log(`  qid=${after?.qid}  q_match_method=${after?.q_match_method}`);
    console.log(`  score=${after?.score}  pv=${after?.pv ?? '?'}`);
    console.log(`  q_match_note=${after?.q_match_note}`);
  } finally {
    client.release();
  }
}

main()
  .catch((err) => { console.error('ERROR:', err.message ?? err); process.exitCode = 1; })
  .finally(() => pool.end());
