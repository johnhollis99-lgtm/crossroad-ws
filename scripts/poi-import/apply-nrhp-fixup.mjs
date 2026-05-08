// Phase 4 writer — applies the proposals from Phase 2's
// fetch-nrhp-coordinates.mjs. Strict bucketing per Phase 3 instructions:
//
//   geometry_fix  : UPDATE location, confidence_score=1.0, source_citation,
//                   venue_metadata (jsonb merge)
//   metadata_only : UPDATE source_citation, venue_metadata (jsonb merge)
//   citation_only : UPDATE source_citation
//
//   long_move_100km : SKIP, full detail saved to manual-review-100km.json
//   long_move_50_100km : APPLY (within geometry_fix or metadata_only bucket
//                        as appropriate), full detail logged to
//                        spot-check-50-100km.json for post-commit audit
//
// Run from: scripts/poi-import/
//   node apply-nrhp-fixup.mjs --dry-run        # preview, no writes
//   node apply-nrhp-fixup.mjs                  # commit
//   node apply-nrhp-fixup.mjs --apply-warned   # also commit the 6 100km
//                                              # outliers (NOT used in this
//                                              # session)
//
// Inputs : cache/nrhp-fixup/proposed-changes.json (from Phase 2)
// Outputs: cache/nrhp-fixup/manual-review-100km.json
//          cache/nrhp-fixup/spot-check-50-100km.json
//          cache/nrhp-fixup/apply-summary-{ts}.json

import { config } from 'dotenv';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../.env') });

const args = process.argv.slice(2);
const opts = {
  dryRun:       args.includes('--dry-run'),
  applyWarned:  args.includes('--apply-warned'),
};

const CACHE_DIR    = path.resolve(__dirname, 'cache', 'nrhp-fixup');
const INPUT_JSON   = path.join(CACHE_DIR, 'proposed-changes.json');
const REVIEW_100KM = path.join(CACHE_DIR, 'manual-review-100km.json');
const SPOT_50_100  = path.join(CACHE_DIR, 'spot-check-50-100km.json');

if (!process.env.DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1); }
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 4,
});

const BATCH_SIZE = 100;

function bucketByWarning(rows) {
  const skip100 = [];
  const audit50 = [];
  const apply   = [];
  for (const r of rows) {
    const w = r.warnings ?? [];
    if (w.includes('long_move_100km')) skip100.push(r);
    else if (w.includes('long_move_50km')) { audit50.push(r); apply.push(r); }
    else apply.push(r);
  }
  return { skip100, audit50, apply };
}

async function applyGeometryFix(client, p) {
  const sql = `
    UPDATE pois SET
      location         = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
      confidence_score = 1.0,
      source_citation  = $3,
      venue_metadata   = COALESCE(venue_metadata, '{}'::jsonb) || $4::jsonb
    WHERE id = $5::uuid
      AND source_type = 'nrhp'
      AND merged_into IS NULL
    RETURNING id
  `;
  const r = await client.query(sql, [
    p.new_lon, p.new_lat,
    p.new_citation,
    JSON.stringify(p.venue_metadata_patch),
    p.id,
  ]);
  return r.rowCount;
}

async function applyMetadataOnly(client, p) {
  const sql = `
    UPDATE pois SET
      source_citation = $1,
      venue_metadata  = COALESCE(venue_metadata, '{}'::jsonb) || $2::jsonb
    WHERE id = $3::uuid
      AND source_type = 'nrhp'
      AND merged_into IS NULL
    RETURNING id
  `;
  const r = await client.query(sql, [
    p.new_citation,
    JSON.stringify(p.venue_metadata_patch),
    p.id,
  ]);
  return r.rowCount;
}

async function applyCitationOnly(client, p) {
  const sql = `
    UPDATE pois SET source_citation = $1
    WHERE id = $2::uuid
      AND source_type = 'nrhp'
      AND merged_into IS NULL
    RETURNING id
  `;
  const r = await client.query(sql, [p.new_citation, p.id]);
  return r.rowCount;
}

async function commitBatch(rows, applier, label) {
  let updated = 0, missed = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const p of slice) {
        const n = await applier(client, p);
        if (n === 1) updated++;
        else missed++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= rows.length) {
      console.log(`  ${label}: ${Math.min(i + BATCH_SIZE, rows.length)} / ${rows.length}  (updated=${updated} missed=${missed})`);
    }
  }
  return { updated, missed };
}

async function main() {
  console.log(`▶ Loading ${INPUT_JSON}…`);
  const out = JSON.parse(await fs.readFile(INPUT_JSON, 'utf8'));

  // 1. Bucket by warning ──────────────────────────────────────────────

  const geom = bucketByWarning(out.proposals);
  const meta = bucketByWarning(out.metadata_only);
  const cite = bucketByWarning(out.citation_only); // no warnings expected; passthrough

  const skip100 = [...geom.skip100, ...meta.skip100, ...cite.skip100];
  const audit50 = [...geom.audit50, ...meta.audit50];

  console.log(`  geometry_fix  : ${out.proposals.length} total → apply ${geom.apply.length}, skip ${geom.skip100.length} (long_move_100km)`);
  console.log(`  metadata_only : ${out.metadata_only.length} total → apply ${meta.apply.length}, skip ${meta.skip100.length} (long_move_100km)`);
  console.log(`  citation_only : ${out.citation_only.length} total → apply ${cite.apply.length}`);
  console.log(`  long_move_50_100km audit (logged): ${audit50.length}`);
  console.log(`  long_move_100km skip (manual review): ${skip100.length}`);

  if (opts.applyWarned) {
    console.log('  --apply-warned set → moving 100km outliers back into apply queue');
    for (const p of geom.skip100) geom.apply.push(p);
    for (const p of meta.skip100) meta.apply.push(p);
  }

  // 2. Write the audit/review JSONs first (so they exist even if the DB
  //    apply later errors out) ───────────────────────────────────────

  const reviewPayload = {
    generated_at: new Date().toISOString(),
    note: 'Long-move proposals (≥100 km from existing coords). SKIPPED in apply pass — full attribute detail captured for a follow-up review session. To re-run with these included use --apply-warned.',
    rows: skip100.map((p) => ({
      ...p,
      origin_bucket: out.proposals.includes(p) ? 'geometry_fix'
                   : out.metadata_only.includes(p) ? 'metadata_only'
                   : 'citation_only',
    })),
  };
  await fs.writeFile(REVIEW_100KM, JSON.stringify(reviewPayload, null, 2), 'utf8');
  console.log(`  wrote ${REVIEW_100KM} (${skip100.length} rows)`);

  const auditPayload = {
    generated_at: new Date().toISOString(),
    note: 'Long-move proposals (50–100 km from existing coords). APPLIED within their original bucket — review post-commit to confirm the new ArcGIS coords are correct.',
    rows: audit50.map((p) => ({
      ...p,
      origin_bucket: out.proposals.includes(p) ? 'geometry_fix' : 'metadata_only',
    })),
  };
  await fs.writeFile(SPOT_50_100, JSON.stringify(auditPayload, null, 2), 'utf8');
  console.log(`  wrote ${SPOT_50_100} (${audit50.length} rows)`);

  // 3. Apply ──────────────────────────────────────────────────────────

  if (opts.dryRun) {
    console.log('\n[--dry-run] no DB writes; bucket counts above are the plan.');
    await pool.end();
    return;
  }

  console.log('\n▶ Applying geometry_fix updates…');
  const geomR = await commitBatch(geom.apply, applyGeometryFix, 'geom');

  console.log('\n▶ Applying metadata_only updates…');
  const metaR = await commitBatch(meta.apply, applyMetadataOnly, 'meta');

  console.log('\n▶ Applying citation_only updates…');
  const citeR = await commitBatch(cite.apply, applyCitationOnly, 'cite');

  // 4. Post-apply verification ───────────────────────────────────────

  console.log('\n▶ Post-apply distribution');
  const dist = await pool.query(`
    SELECT confidence_score, editorial_status, COUNT(*)::int AS n
    FROM pois
    WHERE source_type = 'nrhp' AND merged_into IS NULL
    GROUP BY confidence_score, editorial_status
    ORDER BY confidence_score DESC, editorial_status NULLS FIRST
  `);
  for (const r of dist.rows) {
    console.log(`  confidence=${r.confidence_score}  editorial_status=${r.editorial_status ?? '(null)'}  n=${r.n}`);
  }

  // 5. Summary JSON ──────────────────────────────────────────────────

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const summary = {
    timestamp: new Date().toISOString(),
    geometry_fix:  { attempted: geom.apply.length, updated: geomR.updated, missed: geomR.missed },
    metadata_only: { attempted: meta.apply.length, updated: metaR.updated, missed: metaR.missed },
    citation_only: { attempted: cite.apply.length, updated: citeR.updated, missed: citeR.missed },
    skipped_long_move_100km: skip100.length,
    audited_long_move_50_100km: audit50.length,
    apply_warned: opts.applyWarned,
    confidence_distribution: dist.rows,
  };
  const summaryPath = path.join(CACHE_DIR, `apply-summary-${ts}.json`);
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`\n✓ Wrote ${summaryPath}`);

  await pool.end();
}

main().catch((err) => {
  console.error('FATAL:', err);
  pool.end().finally(() => process.exit(1));
});
