// Item 4: replace wrong Q-numbers in venue_metadata.wikidata for the 6 venues
// where a verified canonical Wikidata entity (with enwiki sitelink, possibly
// via redirect) was found. Mission Dolores Cemetery has no clean Wikidata
// match and is left unfilled (flagged in the report).
//
// Each Q below was verified via wbsearchentities + wbgetentities (label +
// enwiki sitelink) before this script was written — see session log.
//
// Run from: scripts/poi-import/
//   node fix-7-manual-q-numbers.mjs            # live
//   node fix-7-manual-q-numbers.mjs --dry-run  # preview

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const dryRun = process.argv.includes('--dry-run');
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

const FIXES = [
  {
    id:      '95c0ae99-c5c3-4bb1-925c-dace11147ab2',
    name:    'Bodie State Historic Park',
    oldQ:    'Q888057',
    newQ:    'Q832945',
    article: 'Bodie, California',
    note:    'SHP-specific entity Q49475173 has no enwiki sitelink; using the ghost-town article (Bodie SHP redirects there)',
  },
  {
    id:      '6158a6b0-dda8-4efe-b7e2-61317ec76b2e',
    name:    'Hearst San Simeon State Historical Monument',
    oldQ:    'Q5694931',
    newQ:    'Q378143',
    article: 'Hearst Castle',
    note:    'enwiki "Hearst San Simeon State Historical Monument" redirects to Hearst Castle; sharing Q with the Hearst Castle venue is intentional — both attribute pageviews from the same canonical article',
  },
  {
    id:      'b185a594-9d62-484f-b604-d17408e97b3f',
    name:    'Mission La Purísima Concepción',
    oldQ:    'Q1815443',  // = "Poultrygeist: Night of the Chicken Dead" (clearly wrong)
    newQ:    'Q6464680',
    article: 'La Purísima Mission',
    note:    'Mission entity (vs SHP entity Q6464684); the audit name-match gate failure earlier was due to the wrong Q, not an accent normalization issue',
  },
  {
    id:      '90f6a942-2e93-4d9e-9f37-91be43444161',
    name:    'Mountain View Cemetery (Oakland)',
    oldQ:    'Q3326428',
    newQ:    'Q3866478',
    article: 'Mountain View Cemetery (Oakland, California)',
    note:    'clean match',
  },
  {
    id:      '609212f5-a07a-41e6-b347-dfbee105ad24',
    name:    'Forest Lawn Memorial Park (Glendale)',
    oldQ:    'Q5469996',
    newQ:    'Q1437214',
    article: 'Forest Lawn Memorial Park (Glendale, California)',
    note:    'clean match',
  },
  {
    id:      '3aa8d0f6-1a2a-47b3-b9c2-2a4ae94b07e0',
    name:    'Pierce Brothers Westwood Village Memorial Park Cemetery',
    oldQ:    'Q3025948',
    newQ:    'Q1358639',
    article: 'Pierce Brothers Westwood Village Memorial Park and Mortuary',
    note:    'clean match (canonical Wikidata label is "Westwood Village Memorial Park Cemetery"; enwiki article is at the Pierce Brothers redirect)',
  },
];

const UNRESOLVED = [
  {
    id:    '09ddc899-bdf2-4c26-b9ea-ecaba0c448de',
    name:  'Mission Dolores Cemetery',
    reason: 'no Wikidata entity for the cemetery itself; the parent mission Q1000321 ("Mission San Francisco de Asís") would over-attribute pageviews from a much larger article. Left unfilled.',
  },
];

async function fetchState(client, id) {
  const r = await client.query(
    `SELECT name, source_citation,
            venue_metadata->>'wikidata' AS qid,
            significance_score::float AS score,
            (significance_breakdown->>'pageviews')::int AS pv
     FROM pois WHERE id = $1`,
    [id],
  );
  return r.rows[0];
}

async function main() {
  console.log(dryRun ? '— DRY RUN —\n' : '— LIVE —\n');

  console.log('▶ Q-number plan\n');
  for (const f of FIXES) {
    console.log(`  ${f.id}  ${f.oldQ.padEnd(11)} → ${f.newQ.padEnd(11)}  ${f.name}`);
    console.log(`      enwiki: ${f.article}`);
    console.log(`      note:   ${f.note}\n`);
  }
  console.log('▶ Unresolved (flagged for manual review)\n');
  for (const u of UNRESOLVED) {
    console.log(`  ${u.id}  ${u.name}`);
    console.log(`      reason: ${u.reason}\n`);
  }

  if (dryRun) {
    console.log('— DRY RUN — no writes performed.');
    return;
  }

  const client = await pool.connect();
  try {
    console.log('▶ Capturing BEFORE state\n');
    for (const f of FIXES) {
      const b = await fetchState(client, f.id);
      console.log(`  [BEFORE] ${f.name}: qid=${b?.qid}  score=${b?.score}  pv=${b?.pv ?? '?'}`);
    }

    console.log('\n▶ Applying UPDATEs in a single transaction');
    await client.query('BEGIN');
    try {
      for (const f of FIXES) {
        const r = await client.query(
          `UPDATE pois
              SET source_citation = $2,
                  venue_metadata  = jsonb_set(venue_metadata, '{wikidata}', to_jsonb($3::text))
            WHERE id = $1`,
          [f.id, `https://www.wikidata.org/wiki/${f.newQ}`, f.newQ],
        );
        console.log(`  ${f.name}: rowCount=${r.rowCount}`);
      }
      await client.query('COMMIT');
      console.log('  ✓ committed');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    console.log('\n▶ Verifying AFTER state (pre-recompute, pv hasn\'t refreshed yet)\n');
    for (const f of FIXES) {
      const a = await fetchState(client, f.id);
      console.log(`  [AFTER ] ${f.name}: qid=${a?.qid}  score=${a?.score}  pv=${a?.pv ?? '?'}`);
    }
  } finally {
    client.release();
  }
}

main()
  .catch((err) => { console.error('ERROR:', err.message ?? err); process.exitCode = 1; })
  .finally(() => pool.end());
