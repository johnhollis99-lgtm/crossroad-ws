// Diagnostic + recompute driver for editorial-venue pageview enrichment.
//
// Run from: scripts/poi-import/
//   node audit-editorial-pageviews.mjs            # diagnostic + run recompute
//   node audit-editorial-pageviews.mjs --skip-run # diagnostic only, no recompute
//
// 1. Prints all editorial venues with venue_metadata.wikidata = Q-number,
//    showing current significance_score and breakdown.pageviews.
// 2. Invokes recompute-significance.ts --ids=... for that exact set.
// 3. Re-runs the diagnostic so before/after are visible at a glance.

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

const skipRun = process.argv.includes('--skip-run');

const AUDIT_SQL = `
  SELECT id::text                               AS id,
         venue_metadata->>'wikidata'            AS q_number,
         name,
         significance_score                     AS score,
         significance_breakdown->>'pageviews'   AS pageview_score,
         significance_breakdown->>'total'       AS total_score
    FROM pois
   WHERE source_type = 'editorial'
     AND merged_into IS NULL
     AND venue_metadata ? 'wikidata'
     AND venue_metadata->>'wikidata' ~ '^Q\\d+$'
   ORDER BY name
`;

function fmtRow(r) {
  const pv = r.pageview_score ?? '—';
  return `  ${String(r.q_number).padEnd(10)}  ${String(r.name).padEnd(46).slice(0, 46)}  ` +
         `score=${String(r.score).padStart(6)}  pv=${String(pv).padStart(3)}`;
}

async function audit(label) {
  const { rows } = await pool.query(AUDIT_SQL);
  console.log(`\n── ${label} (${rows.length} editorial venues with Q-numbers) ──`);
  for (const r of rows) console.log(fmtRow(r));
  return rows;
}

function runRecompute(ids) {
  return new Promise((resolveP, reject) => {
    const proc = spawn(
      'npx',
      ['tsx', 'recompute-significance.ts', `--ids=${ids.join(',')}`, '--batch-size=200'],
      { cwd: __dirname, stdio: 'inherit', shell: process.platform === 'win32' },
    );
    proc.on('exit', (code) => {
      if (code === 0) resolveP();
      else reject(new Error(`recompute exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

async function main() {
  const before = await audit('BEFORE');
  if (before.length === 0) {
    console.log('No editorial rows with Q-numbers found — nothing to do.');
    await pool.end();
    return;
  }

  // Sanity: how many already have non-zero pageviews? (i.e. lookup already worked somehow)
  const nonZero = before.filter((r) => Number(r.pageview_score) > 0).length;
  console.log(`\n  ${nonZero}/${before.length} already have a non-zero pageview component.`);

  if (skipRun) {
    console.log('\n--skip-run set — exiting after diagnostic.');
    await pool.end();
    return;
  }

  const ids = before.map((r) => r.id);
  console.log(`\n→ Running recompute-significance for ${ids.length} ids…\n`);
  await runRecompute(ids);

  await audit('AFTER');
  await pool.end();
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exitCode = 1;
});
