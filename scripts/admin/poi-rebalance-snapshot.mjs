/**
 * scripts/admin/poi-rebalance-snapshot.mjs
 *
 * Captures a JSON snapshot of POI ranking + soul-doctrine layer
 * distribution. Designed to be run before + after a recompute so the
 * rebalance impact can be measured.
 *
 * Output (stdout): JSON document with:
 *   - timestamp
 *   - layer_distributions: bucket counts for geology + nature + history + architecture + ALL
 *   - top_pois: top 50 by significance_score DESC with category, breakdown, source_type
 *
 * Usage:
 *   node scripts/admin/poi-rebalance-snapshot.mjs > snapshot-before.json
 *   # ... apply changes, recompute ...
 *   node scripts/admin/poi-rebalance-snapshot.mjs > snapshot-after.json
 *
 *   node scripts/admin/poi-rebalance-snapshot.mjs --before=snapshot-before.json --markdown > report.md
 *     -> emits a markdown comparison report (before/after distribution
 *        tables + new-top-30 table + diff: rose/fell/newly surfaced)
 *
 * Read-only. No DB writes.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ENV_PATH   = resolve(SCRIPT_DIR, '..', '..', '.env');

for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq === -1) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (k && !(k in process.env)) process.env[k] = v;
}

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL not set');
  process.exit(1);
}

const argv = process.argv.slice(2);
function flag(name) {
  const a = argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.slice(`--${name}=`.length) : null;
}
const BEFORE_FILE = flag('before');
const EMIT_MARKDOWN = argv.includes('--markdown');
const TOP_N = Number(flag('top-n') ?? '50');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function q(sql, params = []) { return (await pool.query(sql, params)).rows; }

async function captureSnapshot() {
  const layerSlugs = {
    'geology':      ['geology'],
    'nature':       ['nature'],
    'history':      ['history'],
    'architecture': ['architecture'],
  };

  const layer_distributions = {};
  for (const [layer, slugs] of Object.entries(layerSlugs)) {
    const r = (await q(`
      SELECT
        COUNT(*) FILTER (WHERE significance_score >= 95)::int AS b95_100,
        COUNT(*) FILTER (WHERE significance_score >= 90 AND significance_score < 95)::int AS b90_94,
        COUNT(*) FILTER (WHERE significance_score >= 85 AND significance_score < 90)::int AS b85_89,
        COUNT(*) FILTER (WHERE significance_score >= 80 AND significance_score < 85)::int AS b80_84,
        COUNT(*) FILTER (WHERE significance_score >= 70 AND significance_score < 80)::int AS b70_79,
        COUNT(*) FILTER (WHERE significance_score >= 65 AND significance_score < 70)::int AS b65_69,
        COUNT(*) FILTER (WHERE significance_score >= 60 AND significance_score < 65)::int AS b60_64,
        COUNT(*) FILTER (WHERE significance_score < 60)::int AS below_60,
        COUNT(*)::int AS total
      FROM pois p
      JOIN poi_categories pc ON pc.id = p.category_id
      WHERE p.merged_into IS NULL
        AND pc.slug = ANY($1::text[])
    `, [slugs]))[0];
    layer_distributions[layer] = r;
  }

  const fullDist = (await q(`
    SELECT
      COUNT(*) FILTER (WHERE significance_score >= 95)::int AS b95_100,
      COUNT(*) FILTER (WHERE significance_score >= 90 AND significance_score < 95)::int AS b90_94,
      COUNT(*) FILTER (WHERE significance_score >= 85 AND significance_score < 90)::int AS b85_89,
      COUNT(*) FILTER (WHERE significance_score >= 80 AND significance_score < 85)::int AS b80_84,
      COUNT(*) FILTER (WHERE significance_score >= 70 AND significance_score < 80)::int AS b70_79,
      COUNT(*) FILTER (WHERE significance_score >= 65 AND significance_score < 70)::int AS b65_69,
      COUNT(*) FILTER (WHERE significance_score >= 60 AND significance_score < 65)::int AS b60_64,
      COUNT(*) FILTER (WHERE significance_score < 60)::int AS below_60,
      COUNT(*)::int AS total
    FROM pois
    WHERE merged_into IS NULL
  `))[0];
  layer_distributions['ALL_LIVE'] = fullDist;

  const top_pois = await q(`
    SELECT
      p.id,
      p.name,
      pc.slug                            AS category,
      p.significance_score::numeric(6,2) AS score,
      p.significance_breakdown           AS breakdown,
      p.source_type
    FROM pois p
    LEFT JOIN poi_categories pc ON pc.id = p.category_id
    WHERE p.merged_into IS NULL
    ORDER BY p.significance_score DESC, p.name
    LIMIT $1
  `, [TOP_N]);

  return {
    timestamp: new Date().toISOString(),
    layer_distributions,
    top_pois: top_pois.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      score: Number(p.score),
      breakdown: p.breakdown,
      source_type: p.source_type,
    })),
  };
}

function bucketLine(d) {
  return `${d.b95_100} / ${d.b90_94} / ${d.b85_89} / ${d.b80_84} / ${d.b70_79} / ${d.b65_69} / ${d.b60_64} / ${d.below_60} / **${d.total}**`;
}

function renderMarkdown(before, after) {
  let md = `# POI Rebalance Snapshot Report\n\n`;
  md += `_Generated: ${new Date().toISOString()}_  \n`;
  md += `_Before: ${before.timestamp}_  \n`;
  md += `_After:  ${after.timestamp}_\n\n`;

  md += `## Score-bucket distribution by layer (before → after)\n\n`;
  md += `Buckets: 95–100 / 90–94 / 85–89 / 80–84 / 70–79 / **65–69** / **60–64** / <60 / TOTAL\n\n`;
  md += `_(65–69 and 60–64 added to surface the B1 floor-lowering impact for geology + nature.)_\n\n`;
  const layers = ['geology', 'nature', 'history', 'architecture', 'ALL_LIVE'];
  for (const layer of layers) {
    const b = before.layer_distributions[layer];
    const a = after.layer_distributions[layer];
    md += `### ${layer}\n\n`;
    md += `- **BEFORE:** ${bucketLine(b)}\n`;
    md += `- **AFTER:**  ${bucketLine(a)}\n`;
    // Deltas in 70+ tier
    const before70Plus = b.b95_100 + b.b90_94 + b.b85_89 + b.b80_84 + b.b70_79;
    const after70Plus  = a.b95_100 + a.b90_94 + a.b85_89 + a.b80_84 + a.b70_79;
    md += `- Δ at score ≥70: ${after70Plus - before70Plus >= 0 ? '+' : ''}${after70Plus - before70Plus}  (${before70Plus} → ${after70Plus})\n`;
    const newlySurfaced65_69 = (a.b65_69 + a.b70_79) - (b.b65_69 + b.b70_79);
    md += `- POIs newly in 65–79 band: ${newlySurfaced65_69 >= 0 ? '+' : ''}${newlySurfaced65_69}\n\n`;
  }

  md += `## New top 30 POIs (after recompute)\n\n`;
  md += `| # | Score | Category | Name | Source | Breakdown |\n`;
  md += `|---|---:|---|---|---|---|\n`;
  for (let i = 0; i < Math.min(30, after.top_pois.length); i++) {
    const p = after.top_pois[i];
    const b = p.breakdown ?? {};
    const bd = `${b.source_base ?? '?'}+${b.cross_source ?? '?'}+${b.pageviews ?? '?'}+${b.route_adjacency ?? '?'}${b.p31_bonus ? `+${b.p31_bonus}**P31**` : ''}`;
    md += `| ${i + 1} | ${p.score} | ${p.category ?? '?'} | **${(p.name ?? '').replace(/\|/g, '\\|')}** | ${p.source_type ?? '?'} | ${bd} |\n`;
  }
  md += `\n`;

  md += `## Diff: top 30 movement\n\n`;
  const beforeMap = new Map(before.top_pois.slice(0, 30).map((p, i) => [p.id, { rank: i + 1, score: p.score }]));
  const afterMap  = new Map(after.top_pois.slice(0, 30).map((p, i) => [p.id, { rank: i + 1, score: p.score }]));

  const newlySurfaced = after.top_pois.slice(0, 30).filter(p => !beforeMap.has(p.id));
  const droppedOut = before.top_pois.slice(0, 30).filter(p => !afterMap.has(p.id));
  const stayed = after.top_pois.slice(0, 30).filter(p => beforeMap.has(p.id));

  md += `### Newly surfaced in top 30 (${newlySurfaced.length})\n\n`;
  if (newlySurfaced.length === 0) {
    md += `_(none)_\n\n`;
  } else {
    md += `| New Rank | Score | Δ | Category | Name | P31 bonus |\n`;
    md += `|---:|---:|---:|---|---|---|\n`;
    for (const p of newlySurfaced) {
      const newRank = after.top_pois.findIndex(x => x.id === p.id) + 1;
      const beforePoi = before.top_pois.find(x => x.id === p.id);
      const beforeScore = beforePoi?.score ?? '_(not in top ' + TOP_N + ')_';
      const delta = beforePoi ? p.score - beforePoi.score : null;
      const p31 = p.breakdown?.p31_bonus ? `+${p.breakdown.p31_bonus}` : '';
      md += `| ${newRank} | ${p.score} | ${delta !== null ? (delta >= 0 ? '+' : '') + delta : 'NEW'} | ${p.category} | **${p.name}** (was ${beforeScore}) | ${p31} |\n`;
    }
    md += `\n`;
  }

  md += `### Dropped out of top 30 (${droppedOut.length})\n\n`;
  if (droppedOut.length === 0) {
    md += `_(none)_\n\n`;
  } else {
    md += `| Was Rank | Was Score | After Score | Δ | Category | Name |\n`;
    md += `|---:|---:|---:|---:|---|---|\n`;
    for (const p of droppedOut) {
      const wasRank = before.top_pois.findIndex(x => x.id === p.id) + 1;
      const afterPoi = after.top_pois.find(x => x.id === p.id);
      const afterScore = afterPoi?.score ?? '_(below top ' + TOP_N + ')_';
      const delta = afterPoi ? afterPoi.score - p.score : null;
      md += `| ${wasRank} | ${p.score} | ${afterScore} | ${delta !== null ? (delta >= 0 ? '+' : '') + delta : '?'} | ${p.category} | ${p.name} |\n`;
    }
    md += `\n`;
  }

  md += `### Stayed in top 30 (${stayed.length})\n\n`;
  md += `| New Rank | Was Rank | Score (was) | Δ | Category | Name | P31 bonus |\n`;
  md += `|---:|---:|---:|---:|---|---|---|\n`;
  for (const p of stayed) {
    const newRank = after.top_pois.findIndex(x => x.id === p.id) + 1;
    const before_entry = beforeMap.get(p.id);
    const delta = p.score - before_entry.score;
    const deltaStr = delta === 0 ? '±0' : (delta > 0 ? `+${delta}` : `${delta}`);
    const p31 = p.breakdown?.p31_bonus ? `+${p.breakdown.p31_bonus}` : '';
    md += `| ${newRank} | ${before_entry.rank} | ${p.score} (${before_entry.score}) | ${deltaStr} | ${p.category} | ${p.name} | ${p31} |\n`;
  }
  md += `\n`;

  // p31_bonus summary
  let bonusCount = 0;
  let bonusInTop30 = 0;
  for (const p of after.top_pois) {
    if (p.breakdown?.p31_bonus) bonusCount++;
  }
  for (const p of after.top_pois.slice(0, 30)) {
    if (p.breakdown?.p31_bonus) bonusInTop30++;
  }
  md += `## P31 bonus summary (top ${after.top_pois.length})\n\n`;
  md += `- POIs in top ${after.top_pois.length} receiving +10 P31 bonus: ${bonusCount}\n`;
  md += `- POIs in top 30 receiving +10 P31 bonus: ${bonusInTop30}\n`;

  return md;
}

async function main() {
  const current = await captureSnapshot();
  if (BEFORE_FILE && EMIT_MARKDOWN) {
    const before = JSON.parse(readFileSync(BEFORE_FILE, 'utf8'));
    process.stdout.write(renderMarkdown(before, current));
  } else if (BEFORE_FILE) {
    process.stdout.write(JSON.stringify({ before: JSON.parse(readFileSync(BEFORE_FILE, 'utf8')), after: current }, null, 2));
  } else {
    process.stdout.write(JSON.stringify(current, null, 2));
  }
  await pool.end();
}
main().catch(async (err) => {
  console.error('FATAL:', err.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
