#!/usr/bin/env node
/**
 * Phase 1 of E1d (named valleys/basins): build the top-N candidate list
 * and write it to docs/decisions/2026-05-14-named-valleys-candidates.md
 * for curator boost annotation.
 *
 * No DB writes. No code dependency on the regions table. Pure data prep:
 * Wikipedia category fetch + pageview lookup + summary fetch + bbox filter
 * + ranked-by-pageviews markdown output.
 *
 * Run from scripts/region-import/:
 *   npx tsx build-named-valleys-candidates.ts
 *
 * Caches under cache/wikipedia-summaries/ (30d) and cache/wikimedia-pageviews/ (7d).
 */
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, '../../.env') });

// ───────────────────────── config ─────────────────────────

const TOP_N = 80;

// California bbox (loose — matches the corpus-wide CA bbox used elsewhere
// in poi-import, sufficient for filtering out Wikipedia entries that share
// "Valley" naming but live in other US states or countries).
const CA_BBOX = { minLon: -124.5, maxLon: -114.0, minLat: 32.5, maxLat: 42.0 };

// Pageview window — April 2026 (last completed full month as of 2026-05-14).
// Wikimedia REST monthly endpoint requires start = first-of-target-month,
// end = first-of-NEXT-month (CLAUDE.md "Pageview API date-range bug — fixed
// 2026-05-07").
const PAGEVIEW_START = '20260401';
const PAGEVIEW_END   = '20260501';

const CACHE_DIR = path.join(__dirname, 'cache');
const SUMMARY_CACHE_TTL_MS = 30 * 24 * 3600 * 1000;
const PAGEVIEW_CACHE_TTL_MS = 7 * 24 * 3600 * 1000;

const OUTPUT_FILE = resolve(
  __dirname,
  '../../docs/decisions/2026-05-14-named-valleys-candidates.md',
);

// Polite User-Agent per Wikimedia API guidelines.
const USER_AGENT =
  'XRoad-Region-Import/0.1 (https://github.com/johnhollis99-lgtm/crossroad-ws; contact: john)';

const INTER_REQUEST_DELAY_MS = 80;

// Wikipedia categories to query for candidate names.
const WIKIPEDIA_CATEGORIES = [
  'Category:Valleys of California',
];

// Hardcoded supplement — entries that should be included even if they are
// not in (or not yet in) Category:Valleys_of_California. Basins, plains,
// caldera, and famously-named valleys mis-categorised at the Wikipedia
// taxonomy level (e.g., wine-region articles indexed under viticultural
// categories instead of "Valleys of California"). First-run discovery
// confirmed that Owens, Napa, Russian River, and Anza-Borrego are not in
// the canonical valley category.
const SUPPLEMENT_TITLES = [
  // Basins and non-valley landforms
  'Lake Tahoe',
  'Mono Basin',
  'Los Angeles Basin',
  'Carrizo Plain',
  'Long Valley Caldera',
  // Famous valleys not in Category:Valleys_of_California
  'Owens Valley',
  'Napa Valley',
  // "Russian River Valley" alone redirects to the river article (0 pv).
  // "Russian River Valley AVA" is the actual landform/appellation article.
  'Russian River Valley AVA',
  // "Anza-Borrego Desert" redirects to the State Park article — keep only
  // the State Park title.
  'Anza-Borrego Desert State Park',
  // Already-in-category but pinning here defensively
  'Death Valley',
  'Yosemite Valley',
  'Hetch Hetchy Valley',
  'San Joaquin Valley',
  'Sacramento Valley',
  // Addendum-relevant valleys that may not be in the category. Note:
  // "Tehachapi Valley" and "Round Valley (Mendocino County, California)"
  // have no Wikipedia article — curator can hand-add to the markdown
  // table if those are wanted.
  'Cuyama Valley',
  'Capay Valley',
];

// Hand-curated tier-A list — well-mapped famous valleys/basins where an
// OSM relation (natural=valley / place=basin / AVA polygon / NP boundary
// matching the geographic shape) is expected to exist with usable quality.
// Keys are Wikipedia article titles (post-redirect), not display names.
const KNOWN_TIER_A = new Set<string>([
  'Death Valley',
  'Yosemite Valley',
  'Owens Valley',
  'Napa Valley',
  'Coachella Valley',
  'Imperial Valley',
  'San Joaquin Valley',
  'Sacramento Valley',
  'Salinas Valley',
  'Antelope Valley',
  'Santa Clara Valley',
  'San Fernando Valley',
  'San Gabriel Valley',
  'Los Angeles Basin',
  'Mono Basin',
  'Sonoma Valley',
  'Santa Ynez Valley',
  'Russian River Valley',
  'Russian River Valley AVA',
  'Russian River AVA',
  'Carrizo Plain',
  // 'Anza-Borrego Desert State Park' display-overridden to "Anza-Borrego
  // Desert" but the polygon verification will look for the desert landform
  // boundary, not the park admin boundary (per user direction 2026-05-14).
  'Anza-Borrego Desert State Park',
]);

// Hand-curated tier-C list — known to need manual editorial polygon.
// Uses actual Wikipedia article titles (not display names) — Surprise
// Valley is titled "Surprise Valley, Modoc County" on Wikipedia.
//
// `Lake Tahoe` is here because the display-overridden "Lake Tahoe Basin"
// (per user direction 2026-05-14) has no separate Wikipedia/Wikidata
// entity for the basin landform — "Lake Tahoe Basin" redirects to the
// lake article. Phase 2 will hand-digitize the basin polygon from
// terrain rather than try to derive it from the lake.
const KNOWN_TIER_C = new Set<string>([
  'Hetch Hetchy Valley',
  'Surprise Valley, Modoc County',
  'Surprise Valley (California)',
  'Surprise Valley',
  'Lake Tahoe',
]);

// Drop list — candidates to exclude entirely from the top-N. Per user
// direction 2026-05-14:
//
//   'Central Valley (California)'  — keep San Joaquin Valley + Sacramento
//                                    Valley as separate regions; nested
//                                    polygons would fire two narrations
//                                    for the same drive (Soul Doctrine
//                                    prefers non-nested region narration).
//
//   'Castro Valley, California'    — source article is about an Alameda
//                                    County CDP (census-designated place),
//                                    not a regional landform suitable for
//                                    narration. Dropped during curator
//                                    boost-annotation pass.
const DROP_TITLES = new Set<string>([
  'Central Valley (California)',
  'Castro Valley, California',
]);

// Display-name overrides — used only at markdown-write time. The Wikipedia
// article title remains the fetch + dedup + tier-check key; the table row
// shows the geographic-feature name the user wants narrated.
//
//  'Lake Tahoe'                        → 'Lake Tahoe Basin'
//     (the Lake Tahoe article serves as the data source for pageviews and
//      description, but the region we're representing is the basin
//      landform — see KNOWN_TIER_C comment above)
//  'Anza-Borrego Desert State Park'    → 'Anza-Borrego Desert'
//     (Wikipedia has no separate desert landform article; the State Park
//      article serves as the data source, but the region we're representing
//      is the desert/badlands geographic feature, not the park admin
//      boundary — Phase 2 verification will look for the desert polygon)
const DISPLAY_OVERRIDES: Record<string, string> = {
  'Lake Tahoe': 'Lake Tahoe Basin',
  'Anza-Borrego Desert State Park': 'Anza-Borrego Desert',
};

// ───────────────────────── helpers ─────────────────────────

function sha1(s: string): string {
  return crypto.createHash('sha1').update(s).digest('hex');
}

function readCache<T>(file: string, ttlMs: number): T | null {
  try {
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs > ttlMs) return null;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function writeCache<T>(file: string, value: T): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  }
  return await res.json() as T;
}

// ───────────────────────── Wikipedia category fetch ─────────────────────────

interface CategoryMembersResponse {
  query: { categorymembers: Array<{ title: string }> };
  continue?: { cmcontinue: string };
}

async function fetchCategoryMembers(category: string): Promise<string[]> {
  const titles: string[] = [];
  let cmcontinue: string | null = null;
  let page = 0;
  do {
    page++;
    const params = new URLSearchParams({
      action: 'query',
      list: 'categorymembers',
      cmtitle: category,
      cmlimit: '500',
      cmtype: 'page',
      format: 'json',
    });
    if (cmcontinue) params.set('cmcontinue', cmcontinue);
    const url = `https://en.wikipedia.org/w/api.php?${params.toString()}`;
    const json = await fetchJson<CategoryMembersResponse>(url);
    for (const m of json.query.categorymembers) titles.push(m.title);
    cmcontinue = json.continue?.cmcontinue ?? null;
    if (cmcontinue) await sleep(INTER_REQUEST_DELAY_MS);
  } while (cmcontinue);
  return titles;
}

// ───────────────────────── Wikipedia summary fetch ─────────────────────────

interface WPSummary {
  title: string;
  extract?: string;
  coordinates?: { lat: number; lon: number };
  description?: string;
}

async function fetchSummary(title: string): Promise<WPSummary | null> {
  const cacheFile = path.join(CACHE_DIR, 'wikipedia-summaries', `${sha1(title)}.json`);
  const cached = readCache<WPSummary | null>(cacheFile, SUMMARY_CACHE_TTL_MS);
  if (cached !== null) return cached;
  // Cache misses (true null returned from a cache hit) are the absence-of-file case.
  // Hit-but-null is rare; we re-fetch if file is missing or stale.

  const safeTitle = encodeURIComponent(title.replace(/ /g, '_'));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${safeTitle}`;
  try {
    const json = await fetchJson<WPSummary>(url);
    writeCache(cacheFile, json);
    return json;
  } catch (err) {
    console.warn(chalk.yellow(`  summary miss: ${title} — ${(err as Error).message}`));
    writeCache<WPSummary | null>(cacheFile, null);
    return null;
  }
}

// ───────────────────────── Wikimedia pageview fetch ─────────────────────────

interface PageviewsResponse {
  items?: Array<{ views?: number }>;
}

async function fetchPageviews(title: string): Promise<number> {
  const cacheFile = path.join(CACHE_DIR, 'wikimedia-pageviews', `${sha1(title)}.json`);
  const cached = readCache<{ views: number }>(cacheFile, PAGEVIEW_CACHE_TTL_MS);
  if (cached) return cached.views;

  const safeTitle = encodeURIComponent(title.replace(/ /g, '_'));
  const url =
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/` +
    `en.wikipedia/all-access/user/${safeTitle}/monthly/${PAGEVIEW_START}/${PAGEVIEW_END}`;
  try {
    const json = await fetchJson<PageviewsResponse>(url);
    const views = json.items?.[0]?.views ?? 0;
    writeCache(cacheFile, { views });
    return views;
  } catch (err) {
    // 404 = no pageview record for that title (very low traffic / redirect chain). Treat as 0.
    const msg = (err as Error).message;
    if (!msg.includes('404')) {
      console.warn(chalk.yellow(`  pageview miss: ${title} — ${msg}`));
    }
    writeCache(cacheFile, { views: 0 });
    return 0;
  }
}

// ───────────────────────── filtering, sorting, tiering ─────────────────────────

function inCABbox(coord: { lat: number; lon: number }): boolean {
  return (
    coord.lon >= CA_BBOX.minLon &&
    coord.lon <= CA_BBOX.maxLon &&
    coord.lat >= CA_BBOX.minLat &&
    coord.lat <= CA_BBOX.maxLat
  );
}

function firstSentence(extract: string): string {
  // First period followed by space-and-capital, or terminal punctuation.
  // Handles common "U.S." / "Mt." / "St." abbreviations by checking the
  // following character is space + capital. If the natural break isn't
  // detectable, return up to 240 chars.
  const trimmed = extract.trim();
  if (!trimmed) return '';
  const re = /([.!?])\s+(?=[A-Z])/;
  const m = trimmed.match(re);
  if (m && m.index !== undefined) {
    return trimmed.slice(0, m.index + 1);
  }
  return trimmed.length > 240 ? trimmed.slice(0, 237) + '…' : trimmed;
}

function proposedTier(title: string): 'A' | 'B' | 'C' {
  if (KNOWN_TIER_C.has(title)) return 'C';
  if (KNOWN_TIER_A.has(title)) return 'A';
  return 'B';
}

// ───────────────────────── main ─────────────────────────

interface Candidate {
  title: string;
  pageviews_30d: number;
  description: string;
  coord: { lat: number; lon: number } | null;
  inCA: boolean;
}

async function main(): Promise<void> {
  console.log(chalk.bold('Build named-valleys candidate list — E1d Phase 1'));
  console.log(chalk.gray(`  Cache: ${CACHE_DIR}`));
  console.log(chalk.gray(`  Output: ${OUTPUT_FILE}`));
  console.log(chalk.gray(`  Pageview window: ${PAGEVIEW_START} → ${PAGEVIEW_END} (April 2026)`));
  console.log('');

  // 1. Gather candidate titles
  console.log(chalk.bold('Step 1. Wikipedia category members'));
  const allTitles = new Set<string>();
  for (const cat of WIKIPEDIA_CATEGORIES) {
    const titles = await fetchCategoryMembers(cat);
    console.log(chalk.gray(`  ${cat}: ${titles.length} pages`));
    for (const t of titles) allTitles.add(t);
  }
  let addedFromSupplement = 0;
  for (const t of SUPPLEMENT_TITLES) {
    if (!allTitles.has(t)) {
      allTitles.add(t);
      addedFromSupplement++;
    }
  }
  console.log(chalk.gray(`  Supplement: ${addedFromSupplement} added (already-in-category skipped)`));
  console.log(chalk.gray(`  Total unique candidates: ${allTitles.size}`));
  console.log('');

  // 2. Fetch summary + pageviews for each
  console.log(chalk.bold('Step 2. Summaries + pageviews'));
  const candidates: Candidate[] = [];
  const titles = Array.from(allTitles).sort();
  let i = 0;
  for (const title of titles) {
    i++;
    const [summary, pageviews] = await Promise.all([
      fetchSummary(title),
      fetchPageviews(title),
    ]);
    const coord = summary?.coordinates ?? null;
    const inCA = coord ? inCABbox(coord) : false;
    const desc = firstSentence(summary?.extract ?? '');
    candidates.push({
      title,
      pageviews_30d: pageviews,
      description: desc || '(no Wikipedia summary)',
      coord,
      inCA,
    });
    if (i % 25 === 0 || i === titles.length) {
      console.log(chalk.gray(`  ${i}/${titles.length}`));
    }
    await sleep(INTER_REQUEST_DELAY_MS);
  }
  console.log('');

  // 3. Filter to CA bbox (retain supplement entries even without coord)
  console.log(chalk.bold('Step 3. CA bbox filter'));
  const supplementSet = new Set(SUPPLEMENT_TITLES);
  const inCA = candidates.filter((c) => c.inCA);
  const noCoord = candidates.filter((c) => !c.coord);
  const outsideCA = candidates.filter((c) => c.coord && !c.inCA);
  const noCoordSupplement = noCoord.filter((c) => supplementSet.has(c.title));
  console.log(chalk.gray(`  In CA:                    ${inCA.length}`));
  console.log(chalk.gray(`  Outside CA (dropped):     ${outsideCA.length}`));
  console.log(chalk.gray(`  No coordinate (dropped):  ${noCoord.length - noCoordSupplement.length}`));
  console.log(chalk.gray(`  No coordinate (kept — supplement): ${noCoordSupplement.length}`));
  console.log('');

  const keptUnfiltered = [
    ...inCA,
    ...noCoord.filter((c) => supplementSet.has(c.title)),
  ];

  // Apply DROP_TITLES (entries to exclude entirely per user direction)
  const dropped = keptUnfiltered.filter((c) => DROP_TITLES.has(c.title));
  const kept = keptUnfiltered.filter((c) => !DROP_TITLES.has(c.title));
  if (dropped.length > 0) {
    console.log(chalk.gray(`  Dropped per DROP_TITLES: ${dropped.map((c) => c.title).join(', ')}`));
    console.log('');
  }

  // 4. Sort by pageviews desc, take top N
  kept.sort((a, b) => b.pageviews_30d - a.pageviews_30d);
  const topN = kept.slice(0, TOP_N);
  const belowCutoff = kept.slice(TOP_N).filter((c) => c.pageviews_30d > 200);

  console.log(chalk.bold(`Step 4. Top ${topN.length} by pageviews`));
  for (const c of topN.slice(0, 5)) {
    console.log(chalk.gray(`  ${c.pageviews_30d.toString().padStart(7)} — ${c.title}`));
  }
  console.log(chalk.gray(`  … (${topN.length - 5} more)`));
  console.log('');

  // 5. Write markdown
  console.log(chalk.bold('Step 5. Write markdown'));
  const lines: string[] = [];
  lines.push('# E1d named-valleys candidates — boost worksheet');
  lines.push('');
  lines.push(`**Generated:** 2026-05-14`);
  lines.push(`**Source:** Wikipedia ${WIKIPEDIA_CATEGORIES.join(', ')} + hardcoded supplement (${SUPPLEMENT_TITLES.length} basins/plains/named valleys not in the category)`);
  lines.push(`**Pageview window:** April 2026 (monthly total via Wikimedia REST \`/per-article/.../monthly/${PAGEVIEW_START}/${PAGEVIEW_END}\`)`);
  lines.push(`**CA bbox filter:** lon [${CA_BBOX.minLon}, ${CA_BBOX.maxLon}], lat [${CA_BBOX.minLat}, ${CA_BBOX.maxLat}] (coordinates from Wikipedia REST summary endpoint)`);
  lines.push(`**Candidate pool:** ${candidates.length} fetched · ${kept.length} kept after CA filter · top ${topN.length} below`);
  lines.push('');
  lines.push('## How to use this file');
  lines.push('');
  lines.push('Fill in the **Boost** column with `0`, `1`, or `2` for each row you want to influence. Leave blank = pageviews-only ranking. Then hand the file back. The importer will:');
  lines.push('');
  lines.push('1. Compute `score = pageviews_30d + boost × 10000` (so boost=1 ≈ +10k pageviews of weight, boost=2 ≈ +100k)');
  lines.push('2. Re-sort and take top 30');
  lines.push('3. Run polygon-source verification on those 30 (actual OSM Overpass + Wikidata SPARQL lookup; reports A/B/C final split and flags any administrative-polygon-vs-geological cases for per-row decision)');
  lines.push('4. Generate two seed-text samples: Owens Valley (Tier-A OSM, contested-history guardrail test) + Long Valley Caldera (Tier-B Wikidata-buffer fallback test)');
  lines.push('5. Wait for sample approval');
  lines.push('6. Live run for the remaining 28');
  lines.push('');
  lines.push('## Proposed-tier legend');
  lines.push('');
  lines.push('Best-effort initial assignment based on prior knowledge. The polygon-source verification pass (step 3) is the authoritative source — it will move rows between tiers.');
  lines.push('');
  lines.push('- **A** — OSM relation expected to exist with usable polygon (famous, well-mapped valleys/basins, plus the three AVA polygons accepted per sketch correction: Napa, Sonoma, Russian River)');
  lines.push('- **B** — Default for unverified entries; will use Wikidata centroid + radius buffer fallback if OSM has no usable relation');
  lines.push('- **C** — Known to need manual editorial polygon (Hetch Hetchy Valley, Surprise Valley, Lake Tahoe Basin — see corrections note below)');
  lines.push('');
  if (Object.keys(DISPLAY_OVERRIDES).length > 0 || DROP_TITLES.size > 0) {
    lines.push('## Corrections applied to candidate names (2026-05-14)');
    lines.push('');
    if (DROP_TITLES.size > 0) {
      lines.push('**Dropped from list:**');
      lines.push('');
      for (const title of DROP_TITLES) {
        const c = dropped.find((d) => d.title === title);
        const pv = c ? `${c.pageviews_30d.toLocaleString()} pageviews/mo` : 'not in candidate pool';
        lines.push(`- \`${title}\` (${pv}) — keep San Joaquin Valley + Sacramento Valley as separate regions; nested polygons would fire two narrations for the same drive.`);
      }
      lines.push('');
    }
    if (Object.keys(DISPLAY_OVERRIDES).length > 0) {
      lines.push('**Display-overridden entries** (Wikipedia article supplies pageviews + description; row name represents the actual landform we want narrated; Phase 2 verification will look for the landform polygon, not the source article\'s admin/feature boundary):');
      lines.push('');
      for (const [articleTitle, displayName] of Object.entries(DISPLAY_OVERRIDES)) {
        lines.push(`- \`${articleTitle}\` → **${displayName}**`);
      }
      lines.push('');
    }
  }
  lines.push(`## Top ${topN.length} candidates (sorted by 30-day pageviews)`);
  lines.push('');
  lines.push('| Rank | Name | Pageviews_30d | Boost | Tier | Description |');
  lines.push('|-----:|------|--------------:|:-----:|:----:|-------------|');
  let rank = 0;
  for (const c of topN) {
    rank++;
    const tier = proposedTier(c.title);
    const displayName = DISPLAY_OVERRIDES[c.title] ?? c.title;
    const desc = (c.description || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(`| ${rank} | ${displayName} | ${c.pageviews_30d.toLocaleString()} |  | ${tier} | ${desc} |`);
  }
  lines.push('');

  if (belowCutoff.length > 0) {
    lines.push(`## Below-cutoff (${belowCutoff.length} candidates, pageviews > 200)`);
    lines.push('');
    lines.push('Not in the top 80, but high enough pageviews to surface for curator review. Boost any of these to promote into the final 30 — boost is additive on top of the row\'s rank-irrelevant pageview score, so even a low-rank row with `boost=2` will outrank an unboosted top-30 row in most cases.');
    lines.push('');
    lines.push('| Name | Pageviews_30d | Boost | Description |');
    lines.push('|------|--------------:|:-----:|-------------|');
    for (const c of belowCutoff.slice(0, 60)) {
      const displayName = DISPLAY_OVERRIDES[c.title] ?? c.title;
      const desc = (c.description || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      lines.push(`| ${displayName} | ${c.pageviews_30d.toLocaleString()} |  | ${desc} |`);
    }
    if (belowCutoff.length > 60) {
      lines.push('');
      lines.push(`_${belowCutoff.length - 60} additional below-cutoff entries omitted._`);
    }
    lines.push('');
  }

  if (noCoordSupplement.length > 0) {
    lines.push('## Supplement entries kept without coordinate');
    lines.push('');
    lines.push('Hardcoded supplement entries whose Wikipedia summary returned no coordinate. Retained (not bbox-filtered out) because the supplement list is hand-curated CA-only. Verify these are correct CA valleys/basins.');
    lines.push('');
    for (const c of noCoordSupplement) {
      lines.push(`- **${c.title}** (pageviews: ${c.pageviews_30d.toLocaleString()}): ${c.description}`);
    }
    lines.push('');
  }

  // Stats footer
  lines.push('## Build stats');
  lines.push('');
  lines.push(`- Wikipedia category members fetched: ${candidates.length - addedFromSupplement}`);
  lines.push(`- Supplement entries added: ${addedFromSupplement}`);
  lines.push(`- Coordinate present: ${candidates.length - noCoord.length}`);
  lines.push(`- Coordinate inside CA bbox: ${inCA.length}`);
  lines.push(`- Coordinate outside CA bbox: ${outsideCA.length}`);
  lines.push(`- No coordinate (supplement-retained / dropped): ${noCoordSupplement.length} / ${noCoord.length - noCoordSupplement.length}`);
  lines.push(`- Below pageview-cutoff (>200, not top-80): ${belowCutoff.length}`);
  lines.push('');

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, lines.join('\n'));
  console.log(chalk.gray(`  ${OUTPUT_FILE}`));
  console.log('');
  console.log(chalk.bold.green('Done. Hand the file back with boost column filled in.'));
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(`Fatal: ${msg}`));
  process.exit(1);
});
