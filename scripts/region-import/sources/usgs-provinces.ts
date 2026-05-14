/**
 * E1a — USGS Geomorphic Provinces of California.
 *
 * Source: California Geological Survey (CGS) GeoGems MapServer.
 *   Layer 2 — "GeoGems: Geomorphic Provinces"
 *   https://gis.conservation.ca.gov/server/rest/services/CGS/GeoGems/MapServer/2/query
 *
 * The MapServer returns 13 features: the 11 canonical provinces plus 2
 * Coast-Ranges sub-provinces (Northern/Southern Coastline SubProvince).
 * This importer filters to the 11.
 *
 * Per the spec (addendum §3.3, user direction):
 *   region_type        = 'geomorphic_province'
 *   source             = 'usgs'  (CGS is the proximate publisher; we
 *                        bucket it under the existing `usgs` source enum
 *                        rather than adding a new `cgs` value)
 *   source_id          = kebab-case slug of RANGE_NAME
 *   significance_tier  = 80
 *
 * Description generation: each CGS feature has a `PopupInfo` HTML field
 * with a 200–400 word CGS-authored description + a link to the official
 * GeoGem Note PDF. The importer extracts both, uses the description as
 * context for a Claude Haiku one-shot rewrite into narration-ready prose
 * (per user direction), and writes the CGS link into metadata for
 * attribution.
 *
 * Costs are logged to llm_calls per call.
 */
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

import type { ImportOptions, ImportResult, NormalizedRegion } from '../lib/types.js';
import { emptyResult } from '../lib/types.js';
import { upsertRegions } from '../lib/upsert.js';
import { getPgPool } from '../lib/supabase.js';

const CGS_URL =
  'https://gis.conservation.ca.gov/server/rest/services/CGS/GeoGems/MapServer/2/query' +
  '?where=1%3D1&outFields=*&returnGeometry=true&f=geojson';

const CACHE_TTL_DAYS = 30;
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const HAIKU_MAX_TOKENS = 700;

// Haiku 4.5 pricing per Anthropic's public schedule:
//   input  : $1.00 / 1M tokens
//   output : $5.00 / 1M tokens
const HAIKU_INPUT_USD_PER_TOKEN  = 1.00 / 1_000_000;
const HAIKU_OUTPUT_USD_PER_TOKEN = 5.00 / 1_000_000;

/** CGS PopupInfo HTML, with attribution link + description prose. */
interface CgsPopupInfo {
  /** Note title, e.g. "GeoGem Note 53: Colorado Desert Geomorphic Province" */
  noteTitle: string | null;
  /** PDF URL on conservation.ca.gov */
  pdfUrl: string | null;
  /** Plain-text description (HTML stripped, whitespace normalized) */
  description: string;
}

function extractCgsPopupInfo(popupInfoHtml: string): CgsPopupInfo {
  // Parse the link element for noteTitle + pdfUrl
  const linkMatch = popupInfoHtml.match(/<a href="([^"]+)" title="([^"]+)"/);
  const pdfUrl = linkMatch?.[1] ?? null;
  const noteTitle = linkMatch?.[2] ?? null;

  // Strip all HTML tags; collapse whitespace; drop the title sentence
  // (it's a redundant <b>{noteTitle}</b> that ends up at the top).
  let text = popupInfoHtml
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  if (noteTitle) text = text.replace(noteTitle, '').trim();

  return { noteTitle, pdfUrl, description: text };
}

function kebabCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface HaikuResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

// Retry policy for the Haiku API. Anthropic's edge occasionally returns
// transient 503 / 529 / connection-reset errors; production use needs
// backoff. The first live run of this importer (2026-05-14) hit one such
// 503 ("upstream connect error or disconnect/reset before headers") on
// the 2nd call and lost a province; retry below ensures that pattern
// recovers automatically.
const HAIKU_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000];
const HAIKU_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504, 529]);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function callHaiku(provinceName: string, cgsContext: string): Promise<HaikuResponse> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in environment');

  const systemPrompt =
    'You are drafting region-narration source text for a GPS-triggered ' +
    'storytelling app. The user is driving through or near this region. ' +
    'Write a single paragraph of 200–400 words in second-person voice ' +
    '("you cross into…", "above you…"). Lean on the geology, geomorphology, ' +
    'and the sense of crossing a real threshold in the landscape. Avoid ' +
    'tourist-brochure language. Avoid bullet lists, headings, and any ' +
    'meta-commentary. Output only the paragraph itself.';

  const userPrompt =
    `Province name: ${provinceName}\n\n` +
    `Source (California Geological Survey GeoGem Note):\n${cgsContext}\n\n` +
    'Draft the narration paragraph now.';

  type AnthropicResponse = {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= HAIKU_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: HAIKU_MODEL,
          max_tokens: HAIKU_MAX_TOKENS,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        const err = new Error(`Haiku API ${res.status}: ${errText.slice(0, 200)}`);
        if (HAIKU_RETRYABLE_STATUSES.has(res.status) && attempt < HAIKU_RETRY_DELAYS_MS.length) {
          lastErr = err;
          const wait = HAIKU_RETRY_DELAYS_MS[attempt]!;
          console.log(chalk.yellow(`    ${provinceName}: ${err.message} — retrying in ${wait}ms (attempt ${attempt + 2})`));
          await sleep(wait);
          continue;
        }
        throw err;
      }

      const json = (await res.json()) as AnthropicResponse;
      const text = (json.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('')
        .trim();
      const inputTokens = json.usage?.input_tokens ?? 0;
      const outputTokens = json.usage?.output_tokens ?? 0;
      const costUsd =
        inputTokens * HAIKU_INPUT_USD_PER_TOKEN +
        outputTokens * HAIKU_OUTPUT_USD_PER_TOKEN;
      if (!text) throw new Error('Haiku returned empty text');
      return { text, inputTokens, outputTokens, costUsd };
    } catch (err: unknown) {
      // Network-level errors (TypeError on fetch, AbortError, etc.) are also retryable.
      const e = err instanceof Error ? err : new Error(String(err));
      if (attempt < HAIKU_RETRY_DELAYS_MS.length && !e.message.startsWith('Haiku API')) {
        lastErr = e;
        const wait = HAIKU_RETRY_DELAYS_MS[attempt]!;
        console.log(chalk.yellow(`    ${provinceName}: ${e.message} — retrying in ${wait}ms (attempt ${attempt + 2})`));
        await sleep(wait);
        continue;
      }
      throw e;
    }
  }
  throw lastErr ?? new Error('Haiku call failed after retries');
}

async function logLlmCall(
  inputChars: number,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `INSERT INTO public.llm_calls
      (call_type, provider, model_or_voice, input_chars, input_tokens, output_tokens, cost_usd, related_id)
     VALUES ('claude', 'anthropic', $1, $2, $3, $4, $5, NULL)`,
    [HAIKU_MODEL, inputChars, inputTokens, outputTokens, costUsd],
  );
}

interface CachedFile {
  data: GeoJSON.FeatureCollection;
  fetchedAt: string;
  fromCache: boolean;
}

async function loadGeoJson(cacheDir: string, force: boolean): Promise<CachedFile> {
  const dir = path.join(cacheDir, 'usgs');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'geomorphic-provinces.geojson');
  const meta = path.join(dir, 'geomorphic-provinces.meta.json');

  if (!force && fs.existsSync(file) && fs.existsSync(meta)) {
    const m = JSON.parse(fs.readFileSync(meta, 'utf-8')) as { fetchedAt: string };
    const ageMs = Date.now() - new Date(m.fetchedAt).getTime();
    if (ageMs < CACHE_TTL_DAYS * 24 * 3600 * 1000) {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as GeoJSON.FeatureCollection;
      return { data, fetchedAt: m.fetchedAt, fromCache: true };
    }
  }

  console.log(chalk.gray(`  Fetching ${CGS_URL}`));
  const res = await fetch(CGS_URL);
  if (!res.ok) throw new Error(`CGS fetch failed: HTTP ${res.status}`);
  const text = await res.text();
  fs.writeFileSync(file, text);
  const fetchedAt = new Date().toISOString();
  fs.writeFileSync(meta, JSON.stringify({ fetchedAt, source: CGS_URL }, null, 2));
  return { data: JSON.parse(text), fetchedAt, fromCache: false };
}

export async function runImport(opts: ImportOptions): Promise<ImportResult> {
  const result = emptyResult('usgs-provinces');
  const t0 = Date.now();

  // 1. Load the GeoJSON (cached or fresh)
  const { data, fromCache } = await loadGeoJson(opts.cacheDir, opts.force);
  console.log(chalk.gray(`  Loaded ${data.features.length} features (${fromCache ? 'cache hit' : 'fresh fetch'})`));

  // 2. Filter to the 11 canonical provinces (exclude Coast-Ranges sub-provinces)
  const provinces = data.features.filter((f) => {
    const name = f.properties?.['RANGE_NAME'] as string | undefined;
    return Boolean(name && !name.includes('SubProvince'));
  });
  result.fetched = provinces.length;
  console.log(chalk.gray(`  ${provinces.length} provinces after sub-province filter`));

  if (provinces.length !== 11) {
    console.log(chalk.yellow(`  ⚠️  Expected 11 provinces, got ${provinces.length}`));
  }

  // 3. Per province: extract CGS context, draft via Haiku (skipped in dry-run), build NormalizedRegion
  const regions: NormalizedRegion[] = [];
  let totalCostUsd = 0;

  for (const feat of provinces) {
    const props = (feat.properties ?? {}) as Record<string, unknown>;
    const name = props['RANGE_NAME'] as string;
    const popupHtml = (props['PopupInfo'] as string | undefined) ?? '';
    const cgs = extractCgsPopupInfo(popupHtml);

    let description: string;
    if (opts.dryRun) {
      description = `[dry-run placeholder] ${name} — ${cgs.description.slice(0, 120)}…`;
      console.log(chalk.gray(`  ${name}: dry-run, skipping Haiku call (CGS context ${cgs.description.length} chars)`));
    } else {
      try {
        const t1 = Date.now();
        const haiku = await callHaiku(name, cgs.description);
        const dt = Date.now() - t1;
        await logLlmCall(cgs.description.length, haiku.inputTokens, haiku.outputTokens, haiku.costUsd);
        totalCostUsd += haiku.costUsd;
        console.log(chalk.gray(
          `  ${name}: Haiku ${haiku.inputTokens}→${haiku.outputTokens} toks ` +
          `$${haiku.costUsd.toFixed(4)} ${dt}ms`,
        ));
        description = haiku.text;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`  Haiku failed for ${name}: ${msg}`));
        result.errors++;
        continue;
      }
    }

    const region: NormalizedRegion = {
      region_type: 'geomorphic_province',
      name,
      display_name: null,
      description,
      polygon_geojson: feat.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
      significance_tier: 80,
      source: 'usgs',
      source_id: kebabCase(name),
      metadata: {
        cgs_geogem_note_title: cgs.noteTitle,
        cgs_geogem_note_url: cgs.pdfUrl,
        cgs_source_excerpt: cgs.description.slice(0, 240),
      },
    };
    regions.push(region);
    result.normalized++;
  }

  console.log(chalk.gray(`  Total Haiku spend this run: $${totalCostUsd.toFixed(4)}`));

  // 4. Upsert
  const upsertResult = await upsertRegions(regions, { dryRun: opts.dryRun });
  result.inserted = upsertResult.inserted;
  result.updated = upsertResult.updated;
  result.errors += upsertResult.errors;

  result.durationMs = Date.now() - t0;
  return result;
}
