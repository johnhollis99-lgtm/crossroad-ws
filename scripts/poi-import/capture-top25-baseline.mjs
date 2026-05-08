// Capture top-25 by significance to a JSON file.
// Default scope: 4-county SoCal bbox. Pass --statewide for the full California bbox.
// Matches the top10-bbox.mjs query (children allowed; marked with 'c').
//
// Run from: scripts/poi-import/
//   node capture-top25-baseline.mjs <output-path>
//   node capture-top25-baseline.mjs <output-path> --statewide

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const argv = process.argv.slice(2);
const statewide = argv.includes('--statewide');
const outArg = argv.find((a) => !a.startsWith('--'));
if (!outArg) {
  console.error('Usage: node capture-top25-baseline.mjs <output-path> [--statewide]');
  process.exit(1);
}
const outPath = resolve(process.cwd(), outArg);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}

const BBOX_4COUNTY = {
  minLat: 32.5295236,
  minLon: -120.734382,
  maxLat: 35.114665,
  maxLon: -116.0810941,
};

const BBOX_STATEWIDE = {
  minLat: 32.5,
  minLon: -124.5,
  maxLat: 42.0,
  maxLon: -114.0,
};

const BBOX = statewide ? BBOX_STATEWIDE : BBOX_4COUNTY;
const SCOPE_LABEL = statewide ? 'California statewide' : '4-county SoCal';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  const r = await pool.query(
    `SELECT id::text                           AS id,
            name,
            source_type,
            significance_score::float          AS score,
            significance_breakdown,
            venue_type,
            is_venue,
            parent_poi_id::text                AS parent_poi_id,
            venue_metadata->>'wikidata'        AS qid
       FROM pois
      WHERE merged_into IS NULL
        AND ST_Within(location::geometry,
                      ST_MakeEnvelope($1, $2, $3, $4, 4326))
      ORDER BY significance_score DESC, name
      LIMIT 25`,
    [BBOX.minLon, BBOX.minLat, BBOX.maxLon, BBOX.maxLat],
  );

  const captured_at = new Date().toISOString();
  const entries = r.rows.map((row, idx) => {
    const b = row.significance_breakdown ?? {};
    const role = row.is_venue ? 'V' : (row.parent_poi_id ? 'c' : '-');
    return {
      rank:        idx + 1,
      score:       row.score,
      source_type: row.source_type,
      role,
      venue_type:  row.venue_type ?? null,
      qid:         row.qid ?? null,
      name:        row.name,
      id:          row.id,
      parent_poi_id: row.parent_poi_id ?? null,
      breakdown: {
        source_base:     b.source_base ?? null,
        cross_source:    b.cross_source ?? null,
        pageviews:       b.pageviews ?? null,
        route_adjacency: b.route_adjacency ?? null,
        total:           b.total ?? null,
      },
    };
  });

  const payload = {
    captured_at,
    bbox: BBOX,
    filter: 'merged_into IS NULL; ST_Within bbox; ORDER BY significance_score DESC, name LIMIT 25',
    count: entries.length,
    entries,
  };

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`✓ wrote ${entries.length} entries to ${outPath}`);
  console.log('');

  // Pretty table for the console.
  console.log('rk | score | role | source         | vtype             | name                                            | id                                   | base/xs/pv/ra');
  console.log('---+-------+------+----------------+-------------------+-------------------------------------------------+--------------------------------------+--------------');
  for (const e of entries) {
    const score = Number(e.score).toFixed(1).padStart(5);
    const role  = e.role.padStart(4);
    const src   = String(e.source_type ?? '-').padEnd(14);
    const vt    = String(e.venue_type ?? '-').padEnd(17);
    const name  = String(e.name).slice(0, 47).padEnd(47);
    const id    = e.id;
    const b     = e.breakdown;
    const bd    = `${b.source_base ?? '-'}/${b.cross_source ?? '-'}/${b.pageviews ?? '-'}/${b.route_adjacency ?? '-'}`;
    console.log(`${String(e.rank).padStart(2)} | ${score} | ${role} | ${src} | ${vt} | ${name} | ${id} | ${bd}`);
  }
}

main()
  .catch((err) => {
    console.error('ERROR:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
