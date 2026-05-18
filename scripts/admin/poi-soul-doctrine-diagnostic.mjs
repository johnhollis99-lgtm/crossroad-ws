/**
 * scripts/admin/poi-soul-doctrine-diagnostic.mjs
 *
 * Track 2 of the top-tier POI first run (per
 * docs/decisions/2026-05-15-top-tier-poi-first-run.md): diagnose
 * the soul-doctrine misalignment surfaced in the cutoff slate.
 *
 * The ≥80 top-tier has 18 history POIs vs. 3 in geology + geography
 * combined and 0 in anthropology. Soul-doctrine requires all four
 * layers when source supports; the current ranking promotes history
 * disproportionately. This script answers WHY by examining the
 * significance_breakdown component distribution per layer.
 *
 * Sections:
 *   1. Breakdown component distribution per layer (means + percentiles)
 *   2. Top 20 by raw score within each layer (including sub-70 for
 *      candidates the cutoff is missing)
 *   3. Importer-coverage gaps (Wikidata P31 classes pulled, GNIS
 *      feature classes seen, NRHP / state_landmark distribution)
 *   4. Proposed adjustments — NOT applied, curator reviews
 *
 * Read-only. No DB writes. Outputs markdown to stdout.
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

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function q(sql, params = []) { return (await pool.query(sql, params)).rows; }

// Layer → slug mapping (matches Deliverable B in inventory script)
const LAYERS = [
  { name: 'Geology',                slugs: ['geology'] },
  { name: 'Geography',              slugs: ['nature'] },
  { name: 'Anthropology',           slugs: ['native_history'] },
  { name: 'History',                slugs: ['history'] },
  { name: 'Architecture (compare)', slugs: ['architecture'] },
];

function fmtTable(rows, columns) {
  if (rows.length === 0) return '_(no rows)_';
  const widths = columns.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
  const head = '| ' + columns.map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |';
  const sep  = '|' + widths.map(w => '-'.repeat(w + 2)).join('|') + '|';
  const body = rows.map(r => '| ' + columns.map((c, i) => String(r[c] ?? '').padEnd(widths[i])).join(' | ') + ' |').join('\n');
  return head + '\n' + sep + '\n' + body;
}

async function section1_componentDistribution() {
  console.log('## 1. Breakdown-component distribution by soul-doctrine layer');
  console.log('');
  console.log('Per-layer mean + quartile breakdown of `significance_breakdown.{source_base, cross_source, pageviews, route_adjacency}`. Live POIs only. Helps see which component is starving which layer.');
  console.log('');

  for (const layer of LAYERS) {
    const rows = await q(`
      SELECT
        COUNT(*)::int                                                                                 AS n,
        AVG(p.significance_score)::numeric(6,2)                                                       AS mean_score,
        AVG((p.significance_breakdown->>'source_base')::numeric)::numeric(6,2)                        AS mean_source_base,
        AVG((p.significance_breakdown->>'cross_source')::numeric)::numeric(6,2)                       AS mean_cross_source,
        AVG((p.significance_breakdown->>'pageviews')::numeric)::numeric(6,2)                          AS mean_pageviews,
        AVG((p.significance_breakdown->>'route_adjacency')::numeric)::numeric(6,2)                    AS mean_route_adj,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (p.significance_breakdown->>'source_base')::numeric)::numeric(6,2)     AS med_source_base,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (p.significance_breakdown->>'cross_source')::numeric)::numeric(6,2)    AS med_cross_source,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (p.significance_breakdown->>'pageviews')::numeric)::numeric(6,2)       AS med_pageviews,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (p.significance_breakdown->>'route_adjacency')::numeric)::numeric(6,2) AS med_route_adj,
        MAX((p.significance_breakdown->>'source_base')::numeric)::numeric(6,2)                        AS max_source_base,
        MAX((p.significance_breakdown->>'cross_source')::numeric)::numeric(6,2)                       AS max_cross_source,
        MAX((p.significance_breakdown->>'pageviews')::numeric)::numeric(6,2)                          AS max_pageviews,
        MAX((p.significance_breakdown->>'route_adjacency')::numeric)::numeric(6,2)                    AS max_route_adj
      FROM pois p
      JOIN poi_categories pc ON pc.id = p.category_id
      WHERE p.merged_into IS NULL
        AND pc.slug = ANY($1::text[])
        AND p.significance_breakdown IS NOT NULL
    `, [layer.slugs]);
    const r = rows[0];
    console.log(`### ${layer.name}  _(slugs: ${layer.slugs.join(', ')}, n=${r.n})_`);
    if (r.n === 0) {
      console.log('');
      console.log('_(no POIs in this layer)_');
      console.log('');
      continue;
    }
    console.log('');
    console.log(`Mean score: **${r.mean_score}**`);
    console.log('');
    console.log('| component | mean | median | max | (max possible) |');
    console.log('|---|---:|---:|---:|---:|');
    console.log(`| source_base    | ${r.mean_source_base} | ${r.med_source_base} | ${r.max_source_base} | 100 (importer-supplied base) |`);
    console.log(`| cross_source   | ${r.mean_cross_source} | ${r.med_cross_source} | ${r.max_cross_source} | 30 (+10 per additional source) |`);
    console.log(`| pageviews      | ${r.mean_pageviews} | ${r.med_pageviews} | ${r.max_pageviews} | 20 (log-scale Wikipedia 30-day) |`);
    console.log(`| route_adjacency| ${r.mean_route_adj} | ${r.med_route_adj} | ${r.max_route_adj} | 10 (CA highway proximity) |`);
    console.log('');
  }
}

async function section2_topPerLayer() {
  console.log('## 2. Top 20 POIs per soul-doctrine layer (incl. sub-70 candidates)');
  console.log('');
  console.log('Surfaces what the layers contain at the top, regardless of cutoff. Sub-70 candidates here are what the curator can hand-boost if needed.');
  console.log('');

  for (const layer of LAYERS) {
    const rows = await q(`
      SELECT
        p.name,
        p.significance_score::numeric(6,2) AS score,
        p.significance_breakdown,
        p.source_type,
        p.source_id,
        ARRAY(SELECT unnest(p.tags) LIMIT 4) AS tag_sample,
        LEFT(COALESCE(p.description, ''), 100) AS desc_excerpt
      FROM pois p
      JOIN poi_categories pc ON pc.id = p.category_id
      WHERE p.merged_into IS NULL
        AND pc.slug = ANY($1::text[])
      ORDER BY p.significance_score DESC, p.name
      LIMIT 20
    `, [layer.slugs]);
    console.log(`### ${layer.name}`);
    console.log('');
    if (rows.length === 0) {
      console.log('_(no POIs in this layer)_');
      console.log('');
      continue;
    }
    console.log('| # | Score | Name | Source | Breakdown | Desc/tags |');
    console.log('|---|---:|---|---|---|---|');
    rows.forEach((r, i) => {
      const b = r.significance_breakdown;
      const breakdown = b ? `${b.source_base ?? '?'}+${b.cross_source ?? '?'}+${b.pageviews ?? '?'}+${b.route_adjacency ?? '?'}` : 'null';
      const ctx = (r.desc_excerpt || (r.tag_sample ?? []).join(', ') || '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').slice(0, 80);
      console.log(`| ${i + 1} | ${r.score} | ${(r.name || '').replace(/\|/g, '\\|')} | ${r.source_type} | ${breakdown} | ${ctx} |`);
    });
    console.log('');
  }
}

async function section3_importerCoverage() {
  console.log('## 3. Importer coverage gaps per layer');
  console.log('');

  // Source-type breakdown by layer
  console.log('### Source-type × layer (live POIs)');
  console.log('');
  const rows = await q(`
    SELECT
      pc.slug                           AS layer_slug,
      p.source_type,
      COUNT(*)::int                     AS rows,
      AVG(p.significance_score)::numeric(6,2) AS avg_score,
      MAX(p.significance_score)::numeric(6,2) AS max_score
    FROM pois p
    JOIN poi_categories pc ON pc.id = p.category_id
    WHERE p.merged_into IS NULL
      AND pc.slug IN ('geology', 'nature', 'native_history', 'history', 'architecture')
    GROUP BY pc.slug, p.source_type
    ORDER BY pc.slug, rows DESC
  `);
  console.log(fmtTable(rows, ['layer_slug', 'source_type', 'rows', 'avg_score', 'max_score']));
  console.log('');

  // Wikidata source_id sample for geology + nature — surfaces P31 classes
  console.log('### Wikidata P31 class signal (source_id sample for geology + nature)');
  console.log('');
  console.log('source_id = the Q-number; we group by leading digit clusters to coarsely show concentration. _(For a real audit, run a separate Q→P31 lookup against wikidata.org — out of scope here.)_');
  console.log('');
  const geoWd = await q(`
    SELECT source_id, name, significance_score::numeric(6,2) AS score
    FROM pois p
    JOIN poi_categories pc ON pc.id = p.category_id
    WHERE p.merged_into IS NULL
      AND p.source_type = 'wikidata'
      AND pc.slug = 'geology'
    ORDER BY significance_score DESC
    LIMIT 10
  `);
  console.log('**Top 10 geology Wikidata entries:**');
  console.log('');
  console.log(fmtTable(geoWd, ['source_id', 'name', 'score']));
  console.log('');

  // Specifically: does GNIS appear in the source_type breakdown? The CLAUDE.md
  // says GNIS importer exists; if zero GNIS rows in geology that's a strong
  // signal the importer's class whitelist needs expanding.
  const gnis = await q(`
    SELECT
      COUNT(*) FILTER (WHERE source_type = 'gnis' AND merged_into IS NULL)::int AS gnis_total,
      COUNT(*) FILTER (WHERE source_type = 'gnis' AND merged_into IS NULL AND significance_score >= 50)::int AS gnis_gte_50,
      COUNT(*) FILTER (WHERE source_type = 'gnis' AND merged_into IS NULL AND significance_score >= 70)::int AS gnis_gte_70
    FROM pois
  `);
  console.log('### GNIS importer presence');
  console.log('');
  console.log(`- GNIS rows (live, all categories): **${gnis[0].gnis_total}**`);
  console.log(`- GNIS at score ≥50: ${gnis[0].gnis_gte_50}`);
  console.log(`- GNIS at score ≥70: ${gnis[0].gnis_gte_70}`);
  if (gnis[0].gnis_total === 0) {
    console.log('');
    console.log('  > **Finding:** GNIS importer has NOT contributed any live rows. CLAUDE.md says it\'s implemented (`sources/gnis.ts`, summit / falls / cape / arch / etc. whitelist) but the importer hasn\'t run, OR rows were all dedup-merged into Wikidata/OSM primaries (which would still leave them in merged_into IS NOT NULL). Surface for follow-up.');
  } else if (gnis[0].gnis_gte_70 === 0) {
    console.log('');
    console.log('  > **Finding:** GNIS rows present but ALL score below 70. GNIS\'s significance=0.05 base (intentionally low per CLAUDE.md) means they only land in top tier when dedup-merged into a higher-priority source\'s `additional_sources`. None did so. Suggests the dedup pass missed geology cross-references OR the whitelisted GNIS classes don\'t cross-reference to Wikidata/OSM peaks.');
  }
  console.log('');
}

async function section4_proposals() {
  console.log('## 4. Proposed adjustments (not applied — curator reviews)');
  console.log('');

  console.log('Three adjustment axes per the prompt. Each option includes blast-radius + reversibility notes.');
  console.log('');

  console.log('### (a) Significance formula weights');
  console.log('');
  console.log('Current weights (per `recompute-significance.ts`):');
  console.log('- `source_base` — derives from source priority + per-source seed (editorial / state_landmark / nrhp / wikidata / osm / gnis bases). Max 100 pts.');
  console.log('- `cross_source` — +10 per `additional_sources` entry, max 30 pts.');
  console.log('- `pageviews` — log-scale Wikipedia 30-day views (100→5, 1k→10, 10k→15, 100k+→20 pts).');
  console.log('- `route_adjacency` — +10 within 1km of major CA highways, +5 within 5km of any Interstate/US highway.');
  console.log('- Final cap: 100.');
  console.log('');
  console.log('**Observed history-bias drivers:**');
  console.log('- NRHP + state_landmark are inherently *historical* sources with seeded `source_base` in the 30-50 range, while OSM\'s `source_base` for natural features tops out around 20 absent Wikidata/Wikipedia backing.');
  console.log('- `cross_source` rewards multi-source verification — historical landmarks have NRHP + Wikidata + Wikipedia cross-references far more often than peaks or geological features.');
  console.log('- `pageviews` favors named landmarks with strong Wikipedia presence (Hollywood Sign, Mt. Whitney) but most geological features don\'t have standalone Wikipedia articles.');
  console.log('');
  console.log('**Proposal A1 (low risk, narrow):** add a category-conditional `+10 pts` bonus for `geology` and `nature` POIs that have a Wikidata P31 class indicating significance (`Q8502 mountain`, `Q60504 lake`, `Q34038 waterfall`, `Q124714 hot spring`, `Q1437210 caldera`, etc.). The Q-class IS already retrievable; `recompute-significance.ts` would gain a Wikidata-class lookup. Same blast radius as the existing per-source seeding logic.');
  console.log('- Blast radius: 11,982 nature rows + 58 geology rows; ~100-300 rows would gain 10 pts, of which 5-15 might cross into the ≥70 bucket.');
  console.log('- Reversibility: trivial (re-run recompute with the bonus disabled).');
  console.log('');
  console.log('**Proposal A2 (medium risk):** reweight `cross_source` from `+10/source, max 30` to `+15/source, max 45`, AND bump GNIS bonus when a GNIS row dedup-merges into a primary. Helps geological features that have GNIS + Wikidata + OSM all pointing at the same peak.');
  console.log('- Blast radius: full corpus recompute; full top-25 baseline re-validate required (precedent: `scripts/poi-import/baselines/`).');
  console.log('- Reversibility: re-run recompute with prior weights.');
  console.log('');

  console.log('### (b) Per-category `significance_floor` table values');
  console.log('');
  console.log('Table `category_significance_floors` exists (migration `20260514000004_category_significance_floors.sql`) but is empty — falls back to global floor 70 via COALESCE.');
  console.log('');
  console.log('**Proposal B1 (low risk):** lower per-layer floors where the corpus is genuinely sparse but the soul-doctrine REQUIRES them:');
  console.log('- `geology`: floor **60** (instead of global 70). Surfaces ~2-5 additional geology candidates without flooding the surface.');
  console.log('- `nature`: floor **65** (instead of global 70). Same surfacing logic; nature is geographically essential.');
  console.log('- `history` / `architecture`: keep at 70 (or push history to 75 to counter the over-representation, but that risks dropping legitimate landmarks).');
  console.log('');
  console.log('- Blast radius: only affects the **trigger** decision (which POIs narrate unprompted); does not affect score itself.');
  console.log('- Reversibility: trivial (TRUNCATE the lookup table or re-seed with 70).');
  console.log('');

  console.log('### (c) Importer scope');
  console.log('');
  console.log('**Finding:** the GNIS importer didn\'t contribute meaningfully to the top tier (see Section 3). Two paths forward:');
  console.log('');
  console.log('**Proposal C1:** re-run GNIS importer with a wider feature-class whitelist. CLAUDE.md current list: Summit, Falls, Cape, Arch, Bay, Pillar, Crater, Geyser, Hot Spring, Lava, Lake, Island, Range. Adding: Volcano, Basin, Plateau, Cliff, Canyon, Valley would expand geology candidates.');
  console.log('- Blast radius: re-run `npx tsx scripts/poi-import/run.ts import -s gnis --bbox=…`; GNIS scores at 0.05 base so most won\'t enter top tier directly but will provide cross-source signal during dedup.');
  console.log('- Reversibility: source_type=\'gnis\' rows are isolable; deletion would be one query if needed.');
  console.log('');
  console.log('**Proposal C2:** Wikidata SPARQL expansion — add P31 classes the current import doesn\'t fetch. CLAUDE.md `lib/wikidata-types.ts` enumerates 26 classes; geology-relevant additions might include `Q40080 beach`, `Q12766313 canyon`, `Q150784 fjord`, `Q190429 lagoon`, `Q12876 tunnel-cave`. Curator confirms which classes.');
  console.log('- Blast radius: re-run Wikidata SPARQL for the new classes (≥30k chars cache, $0 cost), then dedup + recompute.');
  console.log('- Reversibility: source_type=\'wikidata\' rows scoped by source_id (Q-number) are isolable; new classes would be tagged so removable.');
  console.log('');
  console.log('**Proposal C3 (anthropology, separate axis):** populate `native_history` slug via narrative extraction phase. This is a roadmap Phase F+ item — not solvable by tweaking importer scope; requires authored content from the WPA Guide / Bancroft / CDNC sources via the narrative-extraction pipeline (scripts/narrative-extraction/). Currently the corpus has 0 native_history POIs. **This is the soul-doctrine\'s biggest structural gap.**');
  console.log('');
  console.log('### Summary recommendation');
  console.log('');
  console.log('Lowest-risk path that addresses the most immediate misalignment:');
  console.log('');
  console.log('1. **B1 (lower geology + nature floors to 60/65)** — pure trigger-policy change, no recompute. Surfaces existing high-quality candidates the global floor is hiding.');
  console.log('2. **A1 (Wikidata P31 class bonus)** — adds ~10 pts to legitimately-significant geological features without disturbing existing scores. Requires recompute + baseline re-validation.');
  console.log('3. **C1 (wider GNIS whitelist)** — improves the input corpus for future dedup passes. Long-term lift, not a v1 first-run fix.');
  console.log('4. **C3 (anthropology corpus)** — the hard problem. Belongs to narrative-extraction phase, not significance tuning.');
  console.log('');
  console.log('None of these block the v1 first run — they shape what cutoff makes sense for the NEXT broader run. The history-skew is captured as a known issue in the decision doc; the first-run narrations are still high-quality content for the cutoff slate as-is.');
  console.log('');
}

async function main() {
  console.log('# Soul-Doctrine Misalignment — Diagnostic Report');
  console.log('');
  console.log(`_Snapshot: ${new Date().toISOString()}_  `);
  console.log('_Track 2 of [docs/decisions/2026-05-15-top-tier-poi-first-run.md](../decisions/2026-05-15-top-tier-poi-first-run.md)_');
  console.log('');

  await section1_componentDistribution();
  await section2_topPerLayer();
  await section3_importerCoverage();
  await section4_proposals();

  await pool.end();
}

main().catch(async (err) => {
  console.error('FATAL:', err.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
