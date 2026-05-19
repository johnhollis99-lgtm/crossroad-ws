/**
 * scripts/curation/export.ts
 *
 * Hybrid curation model — Step 1.
 *
 * Exports POIs that clear category_significance_floors (or the global 70
 * default) into a markdown checklist for the curator to mark up. Per
 * docs/decisions/2026-05-15-top-tier-poi-first-run.md §Curation Model.
 *
 * Pipeline:
 *   1. SELECT live POIs where significance_score >= floor(category)
 *   2. Optional --nevada-filter: AND ST_X(location::geometry) >= -114.5
 *      (quick fix for SPARQL Nevada bleed; v1.1 fix is wdt:P131+ wd:Q99)
 *   3. Group by category, sort by score desc then name asc within category
 *   4. Pre-mark the 14 known noise items as [r] with the rejection notes
 *      already captured in the decision doc
 *   5. Append "## Curator Additions" section with instructions for
 *      [+] editorial seeds and manual boosts
 *
 * CLI:
 *   npx tsx scripts/curation/export.ts --output docs/poi-curation/2026-05-18-v1-launch-slate.md
 *     [--use-category-floors]   (default: on; pass --no-category-floors to use global 70)
 *     [--nevada-filter]         (CA-only longitude pre-filter)
 *     [--limit N]               (cap per-category for quick previews)
 *
 * The script does NOT mutate the database. It only reads + emits markdown.
 * Curation decisions are applied by the companion `import.ts`.
 *
 * Run from project root or from scripts/curation/:
 *   cd scripts/curation && npm install
 *   npx tsx export.ts --output ../../docs/poi-curation/2026-05-18-v1-launch-slate.md \
 *                     --use-category-floors --nevada-filter
 */

import { config as dotenvConfig } from 'dotenv';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));

dotenvConfig({ path: resolve(__dirname, '..', '..', '.env') });

// ── Constants ────────────────────────────────────────────────────────────

const GLOBAL_DEFAULT_FLOOR = 70;
const NEVADA_LONGITUDE_CUTOFF = -114.5; // California is west of (more negative than) this rough cutoff.
                                       // SQL filter: ST_X(location::geometry) <= -114.5 keeps CA-side, drops AZ/UT.
                                       // (Note: this is a coarse filter. It will NOT exclude Las Vegas at -115.14
                                       //  or Nevada peaks at -118 to -119 which share longitudes with eastern CA.
                                       //  The proper fix is `?item wdt:P131+ wd:Q99` in the SPARQL importer.)
const DOC_REF = 'docs/decisions/2026-05-15-top-tier-poi-first-run.md';

/**
 * 14 known noise items from the v1 first run, per decision doc §Noise
 * exclusions. Pre-marked as [r] with the curator's rejection notes.
 *
 * Match is case-insensitive exact-name. Two of the original 6 had UUIDs
 * resolved separately during the smoke batch, but for self-contained
 * scoping name-based match is used here.
 *
 * Reject reason taxonomy:
 *   theme_park_child  — venue child of a theme park (Disneyland, etc.)
 *   theme_park        — small or defunct theme park itself
 *   defunct           — entity no longer exists
 *   dedup_duplicate   — duplicate of another POI; dedup missed it
 *   nevada            — confirmed Nevada bleed
 *   nrhp_substance    — NRHP listing with no narrative depth (fire stations)
 *   art_opt_in        — art category, opt-in via Local Color (addendum §1.1)
 */
const PRE_MARKED_REJECTIONS: Array<{ name: string; reason: string }> = [
  { name: 'Grizzly River Run',                            reason: 'theme_park_child — Disney California Adventure ride' },
  { name: 'Walk of Fame',                                 reason: 'dedup_duplicate — duplicate of Hollywood Walk of Fame (dedup Phase B follow-up)' },
  { name: 'Adventure City',                               reason: 'theme_park — small Stanton theme park, not narrate-worthy' },
  { name: 'Sleeping Beauty Castle',                       reason: 'theme_park_child — Disneyland feature' },
  { name: 'Avengers Campus',                              reason: 'theme_park_child — Disney California Adventure feature' },
  { name: 'Marine World/Africa USA',                      reason: 'defunct — merged with Six Flags Discovery Kingdom; entity no longer exists' },
  { name: 'Adventuredome',                                reason: 'nevada — Las Vegas, NV (SPARQL bbox bleed)' },
  { name: 'Cars Land',                                    reason: 'theme_park_child — Disney California Adventure theme area' },
  { name: 'Jurassic World—The Ride',                      reason: 'theme_park_child — Universal Studios ride' },
  { name: 'Jurassic World - The Ride',                    reason: 'theme_park_child — Universal Studios ride (em-dash variant)' },
  { name: 'Jurassic World: The Ride',                     reason: 'theme_park_child — Universal Studios ride (colon variant)' },
  { name: 'Pacific Park',                                 reason: 'theme_park_child — venue child of Santa Monica Pier' },
  { name: 'Oceanside City Hall and Fire Station',         reason: 'nrhp_substance — NRHP listing without narrative depth' },
  { name: 'Fire Station No. 23',                          reason: 'nrhp_substance — NRHP fire station, paperwork-grade only' },
  { name: 'Santa Ana Fire Station Headquarters No. 1',    reason: 'nrhp_substance — NRHP fire station, paperwork-grade only' },
  { name: 'Museum of Contemporary Art San Diego',         reason: 'art_opt_in — art category is Local Color opt-in (addendum §1.1)' },
];

// ── Args ─────────────────────────────────────────────────────────────────

interface Args {
  output: string;
  useCategoryFloors: boolean;
  nevadaFilter: boolean;
  limitPerCategory: number | null;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    if (i >= 0 && i + 1 < argv.length) return argv[i + 1] ?? null;
    const eq = argv.find(a => a.startsWith(`${flag}=`));
    if (eq) return eq.slice(flag.length + 1);
    return null;
  };
  const has = (flag: string): boolean => argv.includes(flag);

  const output = get('--output');
  if (!output) {
    console.error('FATAL: --output <path.md> is required');
    process.exit(1);
  }
  const useCategoryFloors = !has('--no-category-floors');
  const nevadaFilter = has('--nevada-filter');
  const limitRaw = get('--limit');
  const limitPerCategory = limitRaw ? parseInt(limitRaw, 10) : null;
  if (limitRaw && (Number.isNaN(limitPerCategory) || limitPerCategory! <= 0)) {
    console.error(`FATAL: --limit must be a positive integer (got ${limitRaw})`);
    process.exit(1);
  }
  return { output, useCategoryFloors, nevadaFilter, limitPerCategory };
}

// ── Types ────────────────────────────────────────────────────────────────

interface PoiRow {
  id: string;
  name: string;
  description: string | null;
  category_slug: string;
  category_display: string;
  significance_score: number;
  significance_breakdown: Record<string, number> | null;
  source_type: string | null;
  source_citation: string | null;
  effective_floor: number;
  lat: number | null;
  lon: number | null;
  editorial_curated: boolean | null;
  editorial_score_boost: number;
}

// ── Markdown helpers ─────────────────────────────────────────────────────

function escapeMd(s: string): string {
  // Bare-minimum: keep brackets/pipes readable. Curator-facing — no need
  // to over-escape.
  return s.replace(/\r?\n/g, ' ').trim();
}

function oneLine(text: string | null, maxLen = 240): string {
  if (!text) return '_(none)_';
  const t = escapeMd(text);
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1).trimEnd()}…`;
}

function formatBreakdown(b: Record<string, number> | null): string {
  if (!b) return '_(none)_';
  // Stable component order matches the recompute script's pipeline.
  const order = ['source_base', 'cross_source', 'pageviews', 'route_adjacency', 'p31_bonus'];
  const parts: string[] = [];
  for (const k of order) {
    if (k in b) parts.push(`${k}=${b[k]}`);
  }
  // Include any leftover keys not in the canonical order
  for (const k of Object.keys(b)) {
    if (!order.includes(k)) parts.push(`${k}=${b[k]}`);
  }
  return parts.length ? parts.join(', ') : '_(empty)_';
}

function formatLatLon(lat: number | null, lon: number | null): string {
  if (lat == null || lon == null) return '_(no coords)_';
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

function renderEntry(p: PoiRow, preMarkedReason: string | null): string {
  const decisionMark = preMarkedReason ? '[r]' : '[ ]';
  const noteLine = preMarkedReason
    ? `- **Note:** _(pre-marked — ${preMarkedReason})_`
    : '- **Note:** _(curator fills in if needed)_';

  return [
    `## [${p.significance_score}] ${p.name} (${p.category_slug})`,
    `- **Source:** ${p.source_type ?? '_(unknown)_'}`,
    `- **Significance breakdown:** ${formatBreakdown(p.significance_breakdown)}`,
    `- **Description:** ${oneLine(p.description)}`,
    `- **Location:** ${formatLatLon(p.lat, p.lon)}`,
    `- **POI id:** \`${p.id}\``,
    `- **Decision:** ${decisionMark}`,
    noteLine,
  ].join('\n');
}

// ── DB ───────────────────────────────────────────────────────────────────

async function fetchRows(
  pool: pkg.Pool,
  opts: { useCategoryFloors: boolean; nevadaFilter: boolean; limitPerCategory: number | null },
): Promise<PoiRow[]> {
  // The effective floor per row is:
  //   useCategoryFloors=true  → COALESCE(csf.significance_floor, 70)
  //   useCategoryFloors=false → 70
  // We also fetch geography lat/lon (cast to geometry then ST_X / ST_Y).
  const floorExpr = opts.useCategoryFloors
    ? `COALESCE(csf.significance_floor, ${GLOBAL_DEFAULT_FLOOR})`
    : `${GLOBAL_DEFAULT_FLOOR}`;
  const nevadaClause = opts.nevadaFilter
    ? `AND ST_X(p.location::geometry) <= ${NEVADA_LONGITUDE_CUTOFF}`
    : '';

  // Per-category top-N if --limit is set: applied via DENSE_RANK on a
  // window partitioned by category_slug, ordered by significance_score
  // desc / name asc.
  const limitClause = opts.limitPerCategory
    ? `WHERE rn <= ${opts.limitPerCategory}`
    : '';

  const sql = `
    WITH base AS (
      SELECT
        p.id,
        p.name,
        p.description,
        pc.slug              AS category_slug,
        pc.display_name      AS category_display,
        p.significance_score::int                                            AS significance_score,
        p.significance_breakdown                                             AS significance_breakdown,
        p.source_type,
        p.source_citation,
        ${floorExpr}                                                         AS effective_floor,
        CASE WHEN p.location IS NULL THEN NULL ELSE ST_Y(p.location::geometry) END AS lat,
        CASE WHEN p.location IS NULL THEN NULL ELSE ST_X(p.location::geometry) END AS lon,
        p.editorial_curated,
        p.editorial_score_boost,
        ROW_NUMBER() OVER (
          PARTITION BY pc.slug
          ORDER BY p.significance_score DESC, p.name ASC
        )                                                                    AS rn
      FROM public.pois p
      JOIN public.poi_categories pc ON pc.id = p.category_id
      LEFT JOIN public.category_significance_floors csf ON csf.category = pc.slug
      WHERE p.merged_into IS NULL
        AND p.editorial_curated IS NULL
        AND p.significance_score >= ${floorExpr}
        ${nevadaClause}
    )
    SELECT
      id, name, description, category_slug, category_display,
      significance_score, significance_breakdown, source_type, source_citation,
      effective_floor, lat, lon, editorial_curated, editorial_score_boost
    FROM base
    ${limitClause}
    ORDER BY category_slug ASC, significance_score DESC, name ASC
  `;

  const res = await pool.query(sql);
  return res.rows.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    category_slug: r.category_slug,
    category_display: r.category_display,
    significance_score: r.significance_score,
    significance_breakdown: r.significance_breakdown,
    source_type: r.source_type,
    source_citation: r.source_citation,
    effective_floor: r.effective_floor,
    lat: r.lat == null ? null : Number(r.lat),
    lon: r.lon == null ? null : Number(r.lon),
    editorial_curated: r.editorial_curated,
    editorial_score_boost: r.editorial_score_boost ?? 0,
  }));
}

async function fetchFloorTable(pool: pkg.Pool): Promise<Map<string, number>> {
  const res = await pool.query(
    `SELECT category, significance_floor FROM public.category_significance_floors ORDER BY category`,
  );
  const m = new Map<string, number>();
  for (const r of res.rows) m.set(r.category, Number(r.significance_floor));
  return m;
}

// ── Markdown assembly ────────────────────────────────────────────────────

function buildMarkdown(rows: PoiRow[], floors: Map<string, number>, args: Args): {
  md: string;
  stats: { total: number; preMarked: number; perCategory: Map<string, number> };
} {
  const preMarkedLookup = new Map<string, string>();
  for (const r of PRE_MARKED_REJECTIONS) preMarkedLookup.set(r.name.toLowerCase(), r.reason);

  let preMarkedHits = 0;
  const perCategory = new Map<string, PoiRow[]>();
  for (const p of rows) {
    if (!perCategory.has(p.category_slug)) perCategory.set(p.category_slug, []);
    perCategory.get(p.category_slug)!.push(p);
  }

  // Header
  const now = new Date().toISOString();
  const header: string[] = [];
  header.push('# POI Curation — v1 Launch Slate');
  header.push('');
  header.push(`_Exported: ${now}_`);
  header.push('');
  header.push(`_Reference: [${DOC_REF}](../../${DOC_REF})_`);
  header.push('');
  header.push('## How to use this file');
  header.push('');
  header.push('Mark each POI\'s **Decision** line with one of:');
  header.push('');
  header.push('| Mark | Meaning |');
  header.push('|---|---|');
  header.push('| `[x]` | **Approve** for TTS generation |');
  header.push('| `[r]` | **Reject** — do not generate (fill in **Note** with reason if non-obvious) |');
  header.push('| `[+]` | **Boost** — approve AND lift score (default +20; use `[+30]` for custom magnitude) |');
  header.push('| `[ ]` | _(unmarked)_ skip for this batch; remains `editorial_curated = NULL` |');
  header.push('');
  header.push(`Pre-marked rejections from the v1 first-run listening session are stamped \`[r]\` with their reason. ${preMarkedLookup.size} known noise items recognized; matched count printed in the run summary.`);
  header.push('');
  header.push('When finished, run:');
  header.push('');
  header.push('```');
  header.push('cd scripts/curation');
  header.push(`npx tsx import.ts ../../${args.output.replace(/\\/g, '/').replace(/^\.\.\/\.\.\//, '')} --dry-run`);
  header.push('npx tsx import.ts <same path> --apply');
  header.push('```');
  header.push('');
  header.push('## Filter parameters');
  header.push('');
  header.push(`- **Category floors:** ${args.useCategoryFloors ? 'on — uses `category_significance_floors` (geology=60, nature=65, others=70)' : 'off — global 70 floor applied to all categories'}`);
  header.push(`- **Nevada longitude pre-filter:** ${args.nevadaFilter ? `on — \`ST_X(location) <= ${NEVADA_LONGITUDE_CUTOFF}\` keeps California-side rows, drops AZ/UT bleed. **Coarse filter**: will not exclude Las Vegas (-115.14) or central-NV peaks at -118 to -119 (which share longitudes with eastern CA). Proper fix is the v1.1 \`wdt:P131+ wd:Q99\` SPARQL filter.` : 'off — POIs at any longitude included'}`);
  header.push(`- **Per-category limit:** ${args.limitPerCategory ?? '_(no cap)_'}`);
  header.push(`- **Editorial state:** only \`editorial_curated IS NULL\` rows surfaced (already-decided rows are not re-shown)`);
  header.push('');

  if (floors.size > 0) {
    header.push('### Active per-category floors');
    header.push('');
    header.push('| Category | Floor |');
    header.push('|---|---:|');
    for (const [cat, floor] of [...floors.entries()].sort()) {
      header.push(`| ${cat} | ${floor} |`);
    }
    header.push(`| _(all others)_ | ${GLOBAL_DEFAULT_FLOOR} |`);
    header.push('');
  }

  // Per-category content
  const body: string[] = [];
  const perCategoryCount = new Map<string, number>();
  for (const [slug, list] of [...perCategory.entries()].sort()) {
    perCategoryCount.set(slug, list.length);
    const display = list[0]?.category_display ?? slug;
    const floor = floors.get(slug) ?? GLOBAL_DEFAULT_FLOOR;
    body.push(`# Category: ${slug}`);
    body.push('');
    body.push(`_Display name: **${display}** · Effective floor: **${floor}** · Count: **${list.length}**_`);
    body.push('');
    for (const p of list) {
      const reason = preMarkedLookup.get(p.name.toLowerCase()) ?? null;
      if (reason) preMarkedHits++;
      body.push(renderEntry(p, reason));
      body.push('');
    }
  }

  // Curator additions
  const additions: string[] = [];
  additions.push('# Curator Additions');
  additions.push('');
  additions.push('Use this section for **net-new editorial seeds** or **manual boosts** of POIs the algorithm did not surface (e.g., legitimate geology entries that didn\'t clear the floor, or iconic landmarks the catalog under-ranks).');
  additions.push('');
  additions.push('### Three entry shapes the importer understands');
  additions.push('');
  additions.push('1. **Manual boost — bare name** — fuzzy-matches against existing `pois.name`. If exactly one row matches, sets `editorial_curated = TRUE` + `editorial_score_boost = 20`. Multiple matches are flagged.');
  additions.push('   ```markdown');
  additions.push('   - [+] Mt. Whitney');
  additions.push('   ```');
  additions.push('');
  additions.push('2. **Manual boost — name + location hint** — disambiguates by proximity to the hinted region.');
  additions.push('   ```markdown');
  additions.push('   - [+] Mono Lake (Eastern Sierra)');
  additions.push('   - [+30] Yosemite Falls (Yosemite National Park)  // custom boost magnitude');
  additions.push('   ```');
  additions.push('');
  additions.push("3. **Net-new editorial seed** — creates a new POI row with `source_type = 'editorial'`, baseline score 75 (or curator-specified). Coordinates required; if omitted, importer attempts Wikidata Q-number lookup.");
  additions.push('   ```markdown');
  additions.push('   - [+] Painted Dunes — Lassen Volcanic NP — coords 40.491,-121.421 — category geology');
  additions.push('   - [+] Bumpass Hell — Lassen Volcanic NP — coords 40.451,-121.402 — category geology — score 80');
  additions.push('   ```');
  additions.push('');
  additions.push('### Curator additions go here:');
  additions.push('');
  additions.push('<!-- Add lines below; importer parses each `-` bullet. -->');
  additions.push('');
  additions.push('');

  const md = [...header, ...body, ...additions].join('\n');

  return {
    md,
    stats: {
      total: rows.length,
      preMarked: preMarkedHits,
      perCategory: perCategoryCount,
    },
  };
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();

  if (!process.env['DATABASE_URL']) {
    console.error('FATAL: DATABASE_URL not set in .env');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'], max: 2 });

  try {
    console.log('=== POI Curation Export ===');
    console.log(`  Output:               ${args.output}`);
    console.log(`  Category floors:      ${args.useCategoryFloors ? 'ON' : 'OFF (global 70)'}`);
    console.log(`  Nevada longitude cut: ${args.nevadaFilter ? `ON (ST_X <= ${NEVADA_LONGITUDE_CUTOFF}; keeps CA-side)` : 'OFF'}`);
    console.log(`  Per-category limit:   ${args.limitPerCategory ?? 'none'}`);
    console.log('');

    const floors = await fetchFloorTable(pool);
    console.log(`  Active floors loaded: ${floors.size} categories`);
    if (floors.size > 0) {
      for (const [cat, f] of [...floors.entries()].sort()) {
        console.log(`    ${cat.padEnd(20)} ${f}`);
      }
    }
    console.log('');

    const rows = await fetchRows(pool, args);
    console.log(`  POIs in scope: ${rows.length}`);
    console.log('');

    const { md, stats } = buildMarkdown(rows, floors, args);

    // Ensure output dir
    const outAbs = resolve(process.cwd(), args.output);
    const outDir = dirname(outAbs);
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
      console.log(`  Created dir: ${outDir}`);
    }
    writeFileSync(outAbs, md, 'utf-8');
    console.log(`  ✓ Wrote ${outAbs}`);
    console.log('');

    console.log('=== Per-category counts ===');
    for (const [cat, n] of [...stats.perCategory.entries()].sort()) {
      const floor = floors.get(cat) ?? GLOBAL_DEFAULT_FLOOR;
      console.log(`    ${cat.padEnd(20)} ${String(n).padStart(5)}  (floor=${floor})`);
    }
    console.log('');
    console.log(`  Total entries: ${stats.total}`);
    console.log(`  Pre-marked [r] rejections matched: ${stats.preMarked}/${PRE_MARKED_REJECTIONS.length}`);
    if (stats.preMarked < PRE_MARKED_REJECTIONS.length) {
      const matched = new Set<string>();
      for (const p of rows) {
        const reason = PRE_MARKED_REJECTIONS.find(r => r.name.toLowerCase() === p.name.toLowerCase());
        if (reason) matched.add(reason.name);
      }
      const unmatched = PRE_MARKED_REJECTIONS.filter(r => !matched.has(r.name));
      console.log(`    (${unmatched.length} known noise names did not appear in the scope; this is OK — they may have been dedup-merged or fall outside the floor):`);
      for (const u of unmatched) console.log(`      · ${u.name}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FATAL: ${msg}`);
  process.exit(1);
});
