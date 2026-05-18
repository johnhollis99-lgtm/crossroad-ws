/**
 * scripts/admin/poi-inventory.mjs
 *
 * Read-only POI inventory for the top-tier-POI-first-run decision.
 * Produces deliverables A + B + C in one pass; D (decision doc) is
 * authored from these findings separately.
 *
 *   A. DB state inventory     — importer coverage, dedup state, score
 *                                state, intrinsic_depth, iconic_local
 *   B. Score distribution     — soul-doctrine category × bucket
 *                                (95-100 / 90-94 / 85-89 / 80-84 / 70-79)
 *   C. Top 20 at highest bucket — name, category, score, breakdown,
 *                                 source, coords + tags, description
 *
 * Reads DATABASE_URL from repo-root .env. No writes.
 *
 * Usage:
 *   node scripts/admin/poi-inventory.mjs > poi-inventory-$(date +%Y-%m-%d).md
 *   node scripts/admin/poi-inventory.mjs --top-n=20 --bucket-floor=90
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

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const arg = argv.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.slice(`--${name}=`.length) : fallback;
}
const TOP_N = parseInt(flag('top-n', '20'), 10);

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL not set');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function q(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows;
}

function fmtTable(rows, columns) {
  if (rows.length === 0) return '_(no rows)_';
  const widths = columns.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
  const head = '| ' + columns.map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |';
  const sep  = '|' + widths.map(w => '-'.repeat(w + 2)).join('|') + '|';
  const body = rows.map(r => '| ' + columns.map((c, i) => String(r[c] ?? '').padEnd(widths[i])).join(' | ') + ' |').join('\n');
  return head + '\n' + sep + '\n' + body;
}

async function deliverableA() {
  console.log('## Deliverable A — POI Database State Inventory');
  console.log('');
  console.log(`_Snapshot: ${new Date().toISOString()}_`);
  console.log('');

  // Overall counts
  const total = (await q('SELECT COUNT(*)::int AS n FROM pois'))[0].n;
  const live  = (await q('SELECT COUNT(*)::int AS n FROM pois WHERE merged_into IS NULL'))[0].n;
  const merged = total - live;

  console.log('### Overall counts');
  console.log('');
  console.log(`- Total POI rows: **${total.toLocaleString()}**`);
  console.log(`- Live (merged_into IS NULL): **${live.toLocaleString()}**`);
  console.log(`- Merged secondaries: ${merged.toLocaleString()}`);
  console.log('');

  // Source coverage (which importers ran)
  console.log('### Importer coverage (source_type breakdown, live POIs only)');
  console.log('');
  const sources = await q(`
    SELECT source_type,
           COUNT(*)::int AS rows,
           AVG(significance_score)::numeric(6,2) AS avg_score,
           COUNT(*) FILTER (WHERE confidence_score >= 0.5)::int AS gte_0_5_conf
    FROM pois
    WHERE merged_into IS NULL
    GROUP BY source_type
    ORDER BY rows DESC
  `);
  console.log(fmtTable(sources, ['source_type', 'rows', 'avg_score', 'gte_0_5_conf']));
  console.log('');

  // Significance score state
  console.log('### significance_score state (live POIs)');
  console.log('');
  const sigStats = (await q(`
    SELECT
      COUNT(*) FILTER (WHERE significance_score IS NULL)::int AS null_count,
      COUNT(*) FILTER (WHERE significance_score = 0)::int AS zero_count,
      MIN(significance_score)::numeric(6,2) AS min_score,
      MAX(significance_score)::numeric(6,2) AS max_score,
      AVG(significance_score)::numeric(6,2) AS mean_score,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY significance_score)::numeric(6,2) AS median_score,
      PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY significance_score)::numeric(6,2) AS p90_score,
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY significance_score)::numeric(6,2) AS p99_score,
      COUNT(*) FILTER (WHERE significance_breakdown IS NULL)::int AS breakdown_null,
      COUNT(*) FILTER (WHERE significance_breakdown IS NOT NULL)::int AS breakdown_set
    FROM pois
    WHERE merged_into IS NULL
  `))[0];
  console.log(`- score NULL: ${sigStats.null_count}; score 0: ${sigStats.zero_count}`);
  console.log(`- min/median/mean/p90/p99/max: ${sigStats.min_score} / ${sigStats.median_score} / ${sigStats.mean_score} / ${sigStats.p90_score} / ${sigStats.p99_score} / ${sigStats.max_score}`);
  console.log(`- significance_breakdown populated: ${sigStats.breakdown_set} / null: ${sigStats.breakdown_null}`);
  console.log('');

  // intrinsic_depth state
  console.log('### intrinsic_depth state (live POIs)');
  console.log('');
  const idDist = await q(`
    SELECT COALESCE(intrinsic_depth, '_null_') AS intrinsic_depth,
           COUNT(*)::int AS rows
    FROM pois
    WHERE merged_into IS NULL
    GROUP BY intrinsic_depth
    ORDER BY rows DESC
  `);
  console.log(fmtTable(idDist, ['intrinsic_depth', 'rows']));
  console.log('');

  // iconic_local state
  console.log('### iconic_local state (live POIs)');
  console.log('');
  const iconic = (await q(`
    SELECT
      COUNT(*) FILTER (WHERE iconic_local = true)::int AS iconic_true,
      COUNT(*) FILTER (WHERE array_length(iconic_local_reasons, 1) > 0)::int AS reasons_set,
      COUNT(*) FILTER (WHERE signature_hook IS NOT NULL AND signature_hook != '')::int AS hook_set
    FROM pois
    WHERE merged_into IS NULL
  `))[0];
  console.log(`- iconic_local = true: ${iconic.iconic_true}`);
  console.log(`- iconic_local_reasons populated: ${iconic.reasons_set}`);
  console.log(`- signature_hook set: ${iconic.hook_set}`);
  if (iconic.iconic_true === 0) {
    console.log('');
    console.log('  > **Note:** Iconic-local curation has not yet been run. Column added in migration `20260514000003_pois_iconic_local.sql`; importer is roadmap Phase F (`scripts/poi-import/sources/iconic-curation.ts`), not yet built.');
  }
  console.log('');

  // editorial_status
  console.log('### editorial_status (live POIs)');
  console.log('');
  const es = await q(`
    SELECT editorial_status, COUNT(*)::int AS rows
    FROM pois
    WHERE merged_into IS NULL
    GROUP BY editorial_status
    ORDER BY rows DESC
  `);
  console.log(fmtTable(es, ['editorial_status', 'rows']));
  console.log('');

  // Venue state
  console.log('### Venue Tour state (live POIs)');
  console.log('');
  const venueStats = (await q(`
    SELECT
      COUNT(*) FILTER (WHERE is_venue = true)::int AS venues,
      COUNT(*) FILTER (WHERE parent_poi_id IS NOT NULL)::int AS children,
      COUNT(*) FILTER (WHERE parent_poi_id IS NULL AND is_venue = false)::int AS standalone
    FROM pois
    WHERE merged_into IS NULL
  `))[0];
  console.log(`- Venues (is_venue=true): ${venueStats.venues}`);
  console.log(`- Children of venues (parent_poi_id set): ${venueStats.children}`);
  console.log(`- Standalone POIs: ${venueStats.standalone}`);
  console.log('');
}

async function deliverableB(opts = {}) {
  const { bucketFloor = 70 } = opts;
  console.log('## Deliverable B — Soul-Doctrine Category × Bucket Distribution');
  console.log('');

  // Surface what poi_categories slugs actually exist with live POIs
  const categories = await q(`
    SELECT pc.slug,
           pc.display_name,
           COUNT(p.id) FILTER (WHERE p.merged_into IS NULL)::int AS live_rows,
           MAX(p.significance_score)::numeric(6,2) AS max_score,
           AVG(p.significance_score) FILTER (WHERE p.merged_into IS NULL)::numeric(6,2) AS avg_score
    FROM poi_categories pc
    LEFT JOIN pois p ON p.category_id = pc.id
    GROUP BY pc.slug, pc.display_name
    ORDER BY live_rows DESC NULLS LAST
  `);

  console.log('### Category slug census (with live POI counts)');
  console.log('');
  console.log(fmtTable(categories.map(c => ({
    slug: c.slug,
    display_name: c.display_name,
    live_rows: c.live_rows ?? 0,
    avg_score: c.avg_score ?? '-',
    max_score: c.max_score ?? '-',
  })), ['slug', 'display_name', 'live_rows', 'avg_score', 'max_score']));
  console.log('');

  // Map to soul-doctrine layers (best-fit mapping based on slug semantics)
  // Per addendum §1: geology, geography, anthropology, history-when-significant
  console.log('### Soul-doctrine category mapping');
  console.log('');
  console.log('| Layer | Slugs mapped | Rationale |');
  console.log('|---|---|---|');
  console.log('| Geology | `geology`, `nature` (subset — geological-feature tags), `natural_feature` | Landform processes, tectonics, volcanism. `nature` overlaps geology + geography; bucket-tagged for both surfaces. |');
  console.log('| Geography | `nature` | Climate, elevation, ecology, regional distinctness — overlaps geology slug. |');
  console.log('| Anthropology | `native_history` | Indigenous peoples (present-tense). Aspirational slug per CLAUDE.md — populated by narrative extraction / editorial review, NOT by bulk importers. |');
  console.log('| History (significant) | `history` | NRHP / state landmarks / editorial historical sites. |');
  console.log('');

  // Bucket distribution by mapped soul-doctrine category
  const layerSlugs = {
    'Geology': ['geology'],
    'Geography (nature)': ['nature'],
    'Anthropology (native_history)': ['native_history'],
    'History': ['history'],
  };

  console.log('### Score bucket distribution by soul-doctrine layer (live POIs)');
  console.log('');
  console.log('Buckets: 95–100 / 90–94 / 85–89 / 80–84 / 70–79 / <70 (below floor)');
  console.log('');

  const rows = [];
  for (const [layer, slugs] of Object.entries(layerSlugs)) {
    const r = (await q(`
      SELECT
        COUNT(*) FILTER (WHERE significance_score >= 95)::int AS b95_100,
        COUNT(*) FILTER (WHERE significance_score >= 90 AND significance_score < 95)::int AS b90_94,
        COUNT(*) FILTER (WHERE significance_score >= 85 AND significance_score < 90)::int AS b85_89,
        COUNT(*) FILTER (WHERE significance_score >= 80 AND significance_score < 85)::int AS b80_84,
        COUNT(*) FILTER (WHERE significance_score >= 70 AND significance_score < 80)::int AS b70_79,
        COUNT(*) FILTER (WHERE significance_score < 70)::int AS below_floor,
        COUNT(*)::int AS total
      FROM pois p
      JOIN poi_categories pc ON pc.id = p.category_id
      WHERE p.merged_into IS NULL
        AND pc.slug = ANY($1::text[])
    `, [slugs]))[0];
    rows.push({
      layer,
      slugs: slugs.join(', '),
      ...r,
    });
  }
  console.log(fmtTable(rows, ['layer', 'slugs', 'b95_100', 'b90_94', 'b85_89', 'b80_84', 'b70_79', 'below_floor', 'total']));
  console.log('');

  // Also a full-corpus view (all live POIs, all categories)
  console.log('### Full-corpus bucket distribution (all live POIs, all categories)');
  console.log('');
  const fullDist = (await q(`
    SELECT
      COUNT(*) FILTER (WHERE significance_score >= 95)::int AS b95_100,
      COUNT(*) FILTER (WHERE significance_score >= 90 AND significance_score < 95)::int AS b90_94,
      COUNT(*) FILTER (WHERE significance_score >= 85 AND significance_score < 90)::int AS b85_89,
      COUNT(*) FILTER (WHERE significance_score >= 80 AND significance_score < 85)::int AS b80_84,
      COUNT(*) FILTER (WHERE significance_score >= 70 AND significance_score < 80)::int AS b70_79,
      COUNT(*) FILTER (WHERE significance_score < 70)::int AS below_floor,
      COUNT(*)::int AS total
    FROM pois
    WHERE merged_into IS NULL
  `))[0];
  console.log(fmtTable([{ layer: 'ALL LIVE', slugs: '*', ...fullDist }], ['layer', 'slugs', 'b95_100', 'b90_94', 'b85_89', 'b80_84', 'b70_79', 'below_floor', 'total']));
  console.log('');
}

async function deliverableC() {
  console.log(`## Deliverable C — Top ${TOP_N} POIs (curator cutoff slate)`);
  console.log('');
  console.log('Bucket breakdown (live POIs):');
  console.log('');

  // Bucket census so curator sees the full picture
  const bucketRows = (await q(`
    SELECT
      COUNT(*) FILTER (WHERE significance_score >= 95)::int AS b95_100,
      COUNT(*) FILTER (WHERE significance_score >= 90 AND significance_score < 95)::int AS b90_94,
      COUNT(*) FILTER (WHERE significance_score >= 85 AND significance_score < 90)::int AS b85_89,
      COUNT(*) FILTER (WHERE significance_score >= 80 AND significance_score < 85)::int AS b80_84,
      COUNT(*) FILTER (WHERE significance_score >= 70 AND significance_score < 80)::int AS b70_79
    FROM pois
    WHERE merged_into IS NULL
  `))[0];
  console.log(`- 95–100: ${bucketRows.b95_100}`);
  console.log(`- 90–94: ${bucketRows.b90_94}`);
  console.log(`- 85–89: ${bucketRows.b85_89}`);
  console.log(`- 80–84: ${bucketRows.b80_84}`);
  console.log(`- 70–79: ${bucketRows.b70_79}`);
  console.log('');
  console.log(`Curator-spec requested "top 20 at the highest visible bucket." Strictly interpreted, that's the 95–100 bucket which has only ${bucketRows.b95_100} POIs — not enough to choose a cutoff from. **Expanded to top ${TOP_N} by significance_score DESC across all live POIs** so the curator has a real slate to pick a cutoff from; the bucket annotations show where each candidate sits.`);
  console.log('');

  const top = await q(`
    SELECT
      p.id,
      p.name,
      pc.slug                                    AS category,
      p.significance_score::numeric(6,2)         AS score,
      p.significance_breakdown                   AS breakdown,
      p.source_type,
      p.source_id,
      ST_Y(p.location::geometry)::numeric(8,5)   AS lat,
      ST_X(p.location::geometry)::numeric(9,5)   AS lon,
      LEFT(COALESCE(p.description, ''), 220)     AS description_excerpt,
      p.tags,
      p.editorial_status,
      p.intrinsic_depth,
      p.is_venue,
      p.parent_poi_id,
      p.iconic_local
    FROM pois p
    LEFT JOIN poi_categories pc ON pc.id = p.category_id
    WHERE p.merged_into IS NULL
    ORDER BY p.significance_score DESC, p.name
    LIMIT $1
  `, [TOP_N]);

  function bucketOf(score) {
    if (score >= 95) return '95–100';
    if (score >= 90) return '90–94';
    if (score >= 85) return '85–89';
    if (score >= 80) return '80–84';
    if (score >= 70) return '70–79';
    return '<70';
  }

  console.log('| # | Name | Category | Bucket | Score | Source | Lat, Lon | Editorial | Description |');
  console.log('|---|---|---|---|---:|---|---|---|---|');
  top.forEach((r, i) => {
    const breakdown = r.breakdown ? `${r.breakdown.source_base ?? '?'}+${r.breakdown.cross_source ?? '?'}+${r.breakdown.pageviews ?? '?'}+${r.breakdown.route_adjacency ?? '?'}` : 'null';
    const flags = [];
    if (r.is_venue) flags.push('venue');
    if (r.parent_poi_id) flags.push('child');
    if (r.iconic_local) flags.push('iconic');
    const flagStr = flags.length > 0 ? ` _(${flags.join('+')})_` : '';
    const desc = (r.description_excerpt ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|');
    console.log(`| ${i + 1} | **${(r.name ?? '').replace(/\|/g, '\\|')}**${flagStr} | ${r.category ?? '?'} | ${bucketOf(r.score)} | ${r.score} _(${breakdown})_ | ${r.source_type ?? '?'} | ${r.lat}, ${r.lon} | ${r.editorial_status} | ${desc || '_(no description)_'} |`);
  });
  console.log('');

  console.log('### Per-row detail (full breakdown + tags)');
  console.log('');
  top.forEach((r, i) => {
    console.log(`**${i + 1}. ${r.name}** (\`${r.id}\`)`);
    console.log(`- Category: ${r.category} / Source: ${r.source_type} (id=${r.source_id ?? 'n/a'}) / Editorial: ${r.editorial_status}`);
    console.log(`- Score: **${r.score}**; breakdown: \`${JSON.stringify(r.breakdown)}\``);
    console.log(`- Coords: (${r.lat}, ${r.lon}) / intrinsic_depth=${r.intrinsic_depth} / venue=${r.is_venue}/parent=${r.parent_poi_id ?? 'null'}/iconic=${r.iconic_local}`);
    if (r.tags && r.tags.length > 0) console.log(`- Tags (${r.tags.length}): ${r.tags.join(', ')}`);
    if (r.description_excerpt) console.log(`- Description: ${r.description_excerpt}${(r.description_excerpt || '').length >= 220 ? '...' : ''}`);
    console.log('');
  });
}

async function main() {
  console.log('# POI Inventory — Top-Tier-POI-First-Run Preflight');
  console.log('');
  console.log('_For: docs/decisions/2026-05-15-top-tier-poi-first-run.md_');
  console.log('');

  await deliverableA();
  await deliverableB();
  await deliverableC();

  await pool.end();
}

main().catch(async (err) => {
  console.error('FATAL:', err.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
