// One-off: replace placeholder Q-numbers in venue_metadata.wikidata for
// Mission San Diego de Alcalá and Mission Santa Inés with the verified
// canonical Q-numbers. The previous pageview audit explicitly excluded
// 'Q-VERIFY%'/'Q-REAL%' patterns, so these two venues' pageview component
// has been 0. Replacing the placeholders unblocks the pageview signal.
//
// Verified via wbgetentities (both have enwiki sitelinks):
//   Mission San Diego de Alcalá → Q617891
//   Mission Santa Inés          → Q6878745
//
// Run from: scripts/poi-import/
//   node fix-mission-q-numbers.mjs

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

const FIXES = [
  {
    id: 'd2814ccd-60fc-40da-9dd6-446bf1d9d74e',
    label: 'Mission San Diego de Alcalá',
    qid: 'Q617891',
  },
  {
    id: '599c180e-cdf2-4f70-911c-c0de91ed8dd5',
    label: 'Mission Santa Inés',
    qid: 'Q6878745',
  },
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function fetchState(client, id) {
  const r = await client.query(
    `SELECT id, name, source_citation,
            venue_metadata->>'wikidata' AS wikidata_qid,
            significance_score,
            significance_breakdown
     FROM pois
     WHERE id = $1`,
    [id],
  );
  return r.rows[0];
}

function fmtState(prefix, row) {
  if (!row) return `${prefix} (row not found)`;
  const b = row.significance_breakdown ?? {};
  return `${prefix} name="${row.name}"  qid=${row.wikidata_qid}  ` +
    `score=${row.significance_score}  ` +
    `breakdown={base=${b.source_base ?? '?'}, xs=${b.cross_source ?? '?'}, ` +
    `pv=${b.pageviews ?? '?'}, ra=${b.route_adjacency ?? '?'}, total=${b.total ?? '?'}}\n  citation=${row.source_citation}`;
}

async function main() {
  console.log('▶ Capturing BEFORE state\n');
  const client = await pool.connect();
  try {
    for (const fix of FIXES) {
      const before = await fetchState(client, fix.id);
      console.log(fmtState(`  [BEFORE] ${fix.label}:`, before));
    }

    console.log('\n▶ Applying UPDATEs in a transaction');
    await client.query('BEGIN');
    try {
      for (const fix of FIXES) {
        const r = await client.query(
          `UPDATE pois
              SET source_citation = $2,
                  venue_metadata  = jsonb_set(venue_metadata, '{wikidata}', to_jsonb($3::text))
            WHERE id = $1`,
          [fix.id, `https://www.wikidata.org/wiki/${fix.qid}`, fix.qid],
        );
        console.log(`  ${fix.label}: rowCount=${r.rowCount}`);
      }
      await client.query('COMMIT');
      console.log('  ✓ committed');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    console.log('\n▶ Verifying AFTER state\n');
    for (const fix of FIXES) {
      const after = await fetchState(client, fix.id);
      console.log(fmtState(`  [AFTER ] ${fix.label}:`, after));
      if (after?.wikidata_qid !== fix.qid) {
        console.error(`    ! qid mismatch: expected ${fix.qid}, got ${after?.wikidata_qid}`);
        process.exitCode = 2;
      }
    }
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error('ERROR:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
