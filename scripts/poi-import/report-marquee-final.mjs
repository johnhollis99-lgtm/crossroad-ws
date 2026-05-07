// Final-state significance breakdown for the 10 twin-merge venues.

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

const TWIN_QIDS = [
  'Q1337576', 'Q1207585', 'Q2276588', 'Q1946237',
  'Q180401', 'Q29247', 'Q1515080',
  'Q1229098', 'Q181185', 'Q1142351',
];

const rows = await pool.query(
  `SELECT name, significance_score, significance_breakdown,
          venue_metadata->>'wikidata' AS qid,
          jsonb_array_length(coalesce(to_jsonb(additional_sources), '[]'::jsonb)) AS addl_count
     FROM pois
    WHERE source_type = 'editorial'
      AND venue_metadata->>'wikidata' = ANY($1)
    ORDER BY significance_score DESC, name`,
  [TWIN_QIDS],
);

console.log('=== Post-recompute breakdown for the 10 twin-merge venues ===\n');
console.log('QID         | name                                  | total | base | xsrc | pv | route | addl');
console.log('------------|---------------------------------------|-------|------|------|----|-------|-----');
for (const r of rows.rows) {
  const b = r.significance_breakdown ?? {};
  const total = String(r.significance_score).padStart(5);
  const base = String(b.source_base ?? '?').padStart(4);
  const xsrc = String(b.cross_source ?? '?').padStart(4);
  const pv = String(b.pageviews ?? '?').padStart(2);
  const route = String(b.route_adjacency ?? '?').padStart(5);
  const addl = String(r.addl_count).padStart(4);
  const name = r.name.padEnd(38);
  console.log(`${r.qid.padEnd(12)}| ${name}| ${total} | ${base} | ${xsrc} | ${pv} | ${route} | ${addl}`);
}

await pool.end();
