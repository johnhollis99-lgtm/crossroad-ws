/**
 * scripts/precache-popular-routes.ts
 *
 * Pre-generates narration audio for POIs covering the most-used (mode, depth)
 * combinations from the trips table. Two selection modes:
 *   - corridor: POIs along a named or GeoJSON-supplied route
 *   - top-n:    globally highest-significance POIs statewide
 *
 * Run:
 *   cd scripts
 *   npx tsx precache-popular-routes.ts --route-file ./routes/pch.geojson
 *   npx tsx precache-popular-routes.ts --named-route pch-sf-la
 *   npx tsx precache-popular-routes.ts --top-n 30 --min-score 70
 *   npx tsx precache-popular-routes.ts --top-n 5 --min-score 80 --mode driving --depth deep_dive --dry-run
 *
 * Selection (mutually exclusive — exactly one set must be specified):
 *   --route-file <path>   GeoJSON file containing a Feature/FeatureCollection/LineString
 *   --named-route <id>    One of the built-in popular routes (see NAMED_ROUTES below)
 *   --top-n <n>           Globally top-N significance-ranked POIs (statewide, no corridor)
 *
 * Score bounds (apply to either selection mode):
 *   --min-score <s>       Floor on significance_score. Top-N pushes this into
 *                         the SQL query; corridor applies it post-fetch.
 *                         Default: no floor (corridor) / 0 (top-N).
 *   --max-score <s>       Ceiling on significance_score (useful for re-runs of
 *                         lower tiers without re-spending on already-cached
 *                         high-tier POIs). Default: no ceiling (corridor) /
 *                         100 (top-N).
 *
 * Common options:
 *   --corridor-mi <n>     Corridor width in miles (corridor mode only; default: 10)
 *   --mode <m>            Restrict to a single trip mode (driving|hiking)
 *   --depth <d>           Restrict to a single depth (glance|ride_along|deep_dive)
 *   --dry-run             Print what would be generated without actually generating
 *   --limit <n>           Cap on POIs processed (corridor mode); ignored in top-N (use --top-n directly)
 *   --exclude-ids <list>  Comma-separated POI UUIDs to drop from the result. Applied
 *                         right after selection, before the dry-run preview and
 *                         the per-POI generation loop. Use to remove known bad
 *                         selections (duplicates, venue children that surface in
 *                         corridor mode but aren't drive-by appropriate).
 *   --audience <a>        Audience mode for voice lookup (family|kids|unfiltered|local).
 *                         Indexes into voice_configs.mode, which is the audience
 *                         taxonomy — distinct from --mode, which is the trip
 *                         taxonomy (driving|hiking|city). Default: family.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerProvider, generateNarration } from './lib/tts/index.js';
import { GoogleTTSProvider } from './lib/tts/providers/google.js';
import { getAdminClient } from './lib/tts/supabase-admin.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

// ── Env bootstrap ──────────────────────────────────────────────────────────────
function loadEnv(): void {
  try {
    const raw = readFileSync(resolve(SCRIPT_DIR, '..', '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      if (k && !(k in process.env)) process.env[k] = v;
    }
  } catch { /* rely on process.env already set */ }
}

// ── Types ──────────────────────────────────────────────────────────────────────
type NarrationMode  = 'driving' | 'hiking' | 'city';
type AudienceMode   = 'family' | 'kids' | 'unfiltered' | 'local';
const AUDIENCES: readonly AudienceMode[] = ['family', 'kids', 'unfiltered', 'local'];
type NarrationDepth = 'glance' | 'ride_along' | 'deep_dive';

interface POIRow {
  id: string;
  name: string;
  category: string;
  tags: string[];
  source_type: string | null;
  narration_cache: Record<string, string> | null;
  /** Populated by fetchTopPOIs and fetchPOIs; used for dry-run preview only. */
  significance_score: number | null;
}

interface VoiceConfigRow {
  mode: string;
  voice_id: string;
  provider: string;
  voice_settings: { speakingRate?: number } | null;
}

// ── Named routes (WKT LINESTRING, SRID=4326) ──────────────────────────────────
// Waypoints only — the RPC handles the corridor query.
const NAMED_ROUTES: Record<string, string> = {
  'pch-sf-la':
    'SRID=4326;LINESTRING(' +
    '-122.4194 37.7749,-122.2711 37.8044,-122.0597 37.5630,' +
    '-121.9018 36.9741,-121.6553 36.6777,-120.6736 35.6870,' +
    '-119.6989 34.4208,-118.4912 34.0195,-118.2437 34.0522' +
    ')',
  'i5-sf-la':
    'SRID=4326;LINESTRING(' +
    '-122.4194 37.7749,-121.4944 38.5780,-120.4357 37.3526,' +
    '-119.7871 36.7378,-118.8368 35.3733,-118.4912 34.0195' +
    ')',
  'us101-la-sf':
    'SRID=4326;LINESTRING(' +
    '-118.2437 34.0522,-119.1771 34.2164,-120.6597 35.2828,' +
    '-121.8947 36.3733,-122.0232 37.5205,-122.4194 37.7749' +
    ')',
  // 12-waypoint US-101 alignment from downtown LA up to Cambria. Scopes the
  // smoke-batch corridor to the actual drive distance (us101-la-sf covers the
  // whole coast). Final leg from SLO to Cambria leaves 101 for Highway 1 —
  // intentional, the corridor RPC just buffers the line.
  'us101-la-cambria':
    'SRID=4326;LINESTRING(' +
    '-118.244 34.052,'   /* Downtown LA           */ +
    '-118.640 34.150,'   /* Calabasas / 101 split */ +
    '-119.040 34.220,'   /* Camarillo             */ +
    '-119.290 34.275,'   /* Ventura               */ +
    '-119.700 34.420,'   /* Santa Barbara         */ +
    '-119.840 34.435,'   /* Goleta                */ +
    '-120.230 34.475,'   /* Gaviota               */ +
    '-120.195 34.614,'   /* Buellton              */ +
    '-120.435 34.953,'   /* Santa Maria           */ +
    '-120.640 35.143,'   /* Pismo Beach           */ +
    '-120.660 35.282,'   /* San Luis Obispo       */ +
    '-121.080 35.564'    /* Cambria               */ +
    ')',
};

const STORAGE_BUCKET  = 'narration-audio';
const PROMPT_VERSION  = 1;
const ANTHROPIC_BASE  = 'https://api.anthropic.com/v1';

const DEPTH_CFG: Record<NarrationDepth, { sentences: string; maxTokens: number }> = {
  glance:     { sentences: '1-2 sentences',  maxTokens: 400  },
  ride_along: { sentences: 'one paragraph',  maxTokens: 600  },
  deep_dive:  { sentences: '2-3 paragraphs', maxTokens: 1100 },
};

// Conservative dry-run cost estimates per (POI × combo). Real costs will be
// lower because Claude rarely hits maxTokens; these are upper bounds for
// budget sanity checks.
//
// Claude pricing (claude-sonnet-4-6): $3/M input, $15/M output.
// Google TTS pricing (Chirp 3 HD / Neural2):       $16/M chars.
const CLAUDE_INPUT_TOKENS_EST = 150;  // system + user prompt is short
const ESTIMATE_PER_DEPTH: Record<NarrationDepth, { ttsChars: number; claudeOutputTokens: number }> = {
  glance:     { ttsChars: 250,  claudeOutputTokens: 250 },
  ride_along: { ttsChars: 600,  claudeOutputTokens: 500 },
  deep_dive:  { ttsChars: 1500, claudeOutputTokens: 1100 },
};
function estimateCostForCombo(depth: NarrationDepth): number {
  const e = ESTIMATE_PER_DEPTH[depth];
  const claudeUsd = (CLAUDE_INPUT_TOKENS_EST * 3 + e.claudeOutputTokens * 15) / 1_000_000;
  const ttsUsd    = (e.ttsChars * 16) / 1_000_000;
  return claudeUsd + ttsUsd;
}

// ── Claude narration text generation ──────────────────────────────────────────
async function generateText(poi: POIRow, depth: NarrationDepth): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const cfg     = DEPTH_CFG[depth];
  const tagLine = poi.tags?.length ? `Context tags: ${poi.tags.slice(0, 6).join(', ')}.` : '';

  const res = await fetch(`${ANTHROPIC_BASE}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: cfg.maxTokens,
      system:     'You are an engaging road trip narrator for a GPS app. Generate SPOKEN audio narration only — no markdown, no bullet points, no section headers. Write exactly as you would speak aloud to someone in a moving vehicle.',
      messages:   [{
        role:    'user',
        content: `Narrate this point of interest for a driver:\nName: ${poi.name}\nCategory: ${poi.category}\n${tagLine}\n\nLength: ${cfg.sentences}. Open with the most interesting thing — no warm-up phrases. Speak directly to the driver in present tense. Start mid-story.`,
      }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${body}`);
  }

  const data = await res.json() as { content: { text: string }[]; usage: { input_tokens: number; output_tokens: number } };
  const text  = data.content?.[0]?.text?.trim() ?? '';
  if (!text) throw new Error('Claude returned empty narration');

  return { text, inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens };
}

// ── Upload audio buffer to Supabase Storage ───────────────────────────────────
async function uploadAudio(
  poiId: string, mode: NarrationMode, depth: NarrationDepth, voiceId: string,
  audioBuffer: Buffer,
): Promise<string> {
  const sb          = getAdminClient();
  const storagePath = `${poiId}/${mode}/${depth}/${voiceId}.opus`;

  const { error } = await sb.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, audioBuffer, { contentType: 'audio/ogg; codecs=opus', upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

// ── Upsert narration_audio row ────────────────────────────────────────────────
async function upsertNarrationAudio(args: {
  poiId: string; voiceId: string; depth: NarrationDepth; mode: NarrationMode;
  audioUrl: string; charCount: number; costUsd: number; narrationText: string;
}): Promise<string | undefined> {
  const { data, error } = await getAdminClient()
    .from('narration_audio')
    .upsert(
      {
        poi_id:          args.poiId,
        narrator_slug:   args.voiceId,
        depth:           args.depth,
        mode:            args.mode,
        audio_url:       args.audioUrl,
        status:          'ready',
        provider:        'google',
        character_count: args.charCount,
        cost_usd:        args.costUsd,
        prompt_version:  PROMPT_VERSION,
        narration_text:  args.narrationText,
      },
      { onConflict: 'poi_id,narrator_slug,depth', ignoreDuplicates: false },
    )
    .select('id')
    .single();

  if (error) throw new Error(`narration_audio upsert failed: ${error.message}`);
  return data?.id;
}

// ── Update pois.narration_cache ───────────────────────────────────────────────
async function patchNarrationCache(
  poiId: string, cacheKey: string, audioUrl: string,
): Promise<void> {
  const sb = getAdminClient();

  // Try the RPC first (atomic jsonb merge); fall back to a read-modify-write.
  const { error: rpcErr } = await sb.rpc('update_poi_narration_cache', {
    p_poi_id: poiId, p_cache_key: cacheKey, p_audio_url: audioUrl,
  });

  if (!rpcErr) return;

  const { data: existing } = await sb.from('pois').select('narration_cache').eq('id', poiId).single();
  const merged = { ...(existing?.narration_cache as Record<string, string> ?? {}), [cacheKey]: audioUrl };
  await sb.from('pois').update({ narration_cache: merged }).eq('id', poiId);
}

// ── Log llm_calls (fire-and-forget) ──────────────────────────────────────────
async function logCost(args: {
  callType: 'claude' | 'tts'; provider: string; modelOrVoice: string;
  inputChars?: number; inputTokens?: number; outputTokens?: number;
  costUsd: number; relatedId?: string;
}): Promise<void> {
  await getAdminClient().from('llm_calls').insert({
    call_type:      args.callType,
    provider:       args.provider,
    model_or_voice: args.modelOrVoice,
    input_chars:    args.inputChars ?? null,
    input_tokens:   args.inputTokens ?? null,
    output_tokens:  args.outputTokens ?? null,
    cost_usd:       args.costUsd,
    related_id:     args.relatedId ?? null,
  });
}

// ── GeoJSON → WKT LINESTRING ───────────────────────────────────────────────────
function geojsonToWkt(filePath: string): string {
  const raw  = JSON.parse(readFileSync(filePath, 'utf8'));
  let coords: [number, number][] = [];

  if (raw.type === 'FeatureCollection') {
    const feature = raw.features[0];
    coords = feature.geometry.type === 'LineString' ? feature.geometry.coordinates : [];
  } else if (raw.type === 'Feature') {
    coords = raw.geometry.type === 'LineString' ? raw.geometry.coordinates : [];
  } else if (raw.type === 'LineString') {
    coords = raw.coordinates;
  }

  if (coords.length < 2) throw new Error('GeoJSON must contain a LineString with ≥ 2 coordinates');
  return `SRID=4326;LINESTRING(${coords.map(([lng, lat]) => `${lng} ${lat}`).join(',')})`;
}

// ── Query top-N POIs by significance (statewide, no corridor) ─────────────────
// Used by the --top-n selection mode to feed the same downstream pipeline as
// the corridor path. Filters mirror the production drive-by surface:
//   - merged_into IS NULL          (exclude dedup tombstones)
//   - parent_poi_id IS NULL        (exclude venue children — drive-by treats
//                                   venues as singletons; children belong to
//                                   the venue-tour mode only)
//   - confidence_score >= 0.5      (exclude defanged geocoding-bad rows; same
//                                   threshold get_corridor_pois /
//                                   get_nearby_pois apply)
//   - source_type != narrative_extracted (parity with corridor post-filter —
//                                          those need user validation first)
//   - significance_score in [min, max]  (caller-supplied bounds; default 0–100)
//
// Order: significance_score DESC, id ASC for stable cross-run ordering.
async function fetchTopPOIs(
  topN: number, minScore: number, maxScore: number,
): Promise<POIRow[]> {
  const sb = getAdminClient();
  const { data, error } = await sb
    .from('pois')
    .select('id, name, tags, source_type, narration_cache, significance_score, poi_categories!inner(display_name)')
    .is('merged_into', null)
    .is('parent_poi_id', null)
    .gte('confidence_score', 0.5)
    .gte('significance_score', minScore)
    .lte('significance_score', maxScore)
    .neq('source_type', 'narrative_extracted')
    .order('significance_score', { ascending: false })
    .order('id', { ascending: true })
    .limit(topN);

  if (error) throw new Error(`top-N POI fetch failed: ${error.message}`);

  return (data ?? []).map((p: any) => ({
    id:                 p.id,
    name:               p.name,
    category:           p.poi_categories?.display_name ?? 'Unknown',
    tags:               p.tags ?? [],
    source_type:        p.source_type,
    narration_cache:    p.narration_cache,
    significance_score: typeof p.significance_score === 'number' ? p.significance_score : null,
  }));
}

// ── Query POIs along route ─────────────────────────────────────────────────────
async function fetchPOIs(routeWkt: string, corridorMi: number): Promise<POIRow[]> {
  const sb = getAdminClient();

  // Step 1: corridor membership + arc-length ordering. PostgREST caps each
  // response at 1000 rows; the RPC body itself has no LIMIT (verified against
  // 20260504000018 source). Paginate via .range() until we get a short page.
  const RPC_PAGE = 1000;
  const corridor: { id: string }[] = [];
  for (let from = 0; ; from += RPC_PAGE) {
    const { data, error } = await sb
      .rpc('get_corridor_pois', {
        route_geom:           routeWkt,
        corridor_width_miles: corridorMi,
        category_filter:      null,
        mode_filter:          null,
      })
      .range(from, from + RPC_PAGE - 1);
    if (error) throw new Error(`get_corridor_pois failed: ${error.message}`);
    const page = (data as { id: string }[] | null) ?? [];
    if (page.length === 0) break;
    corridor.push(...page);
    if (page.length < RPC_PAGE) break;
  }
  if (corridor.length === 0) return [];
  const ids = corridor.map(r => r.id);

  // Step 2: re-fetch full POI rows. Past ~200 UUIDs the `id=in.(...)` query
  // string overflows PostgREST's URL length budget, so chunk and parallelise.
  // Build a Map to preserve the RPC's arc-length ordering after the merge.
  const DETAIL_CHUNK = 200;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += DETAIL_CHUNK) {
    chunks.push(ids.slice(i, i + DETAIL_CHUNK));
  }
  const responses = await Promise.all(
    chunks.map(slice =>
      sb.from('pois')
        .select('id, name, tags, source_type, narration_cache, significance_score, poi_categories!inner(display_name)')
        .in('id', slice),
    ),
  );

  const rowsById = new Map<string, any>();
  for (const { data, error } of responses) {
    if (error) throw new Error(`POI detail fetch failed: ${error.message}`);
    for (const row of (data as any[] | null) ?? []) {
      rowsById.set(row.id, row);
    }
  }

  // Reorder by RPC sequence; drop any IDs that didn't round-trip (shouldn't
  // happen but defensive — RLS or in-flight deletes could surface a gap).
  const out: POIRow[] = [];
  for (const id of ids) {
    const p = rowsById.get(id);
    if (!p) continue;
    out.push({
      id:                 p.id,
      name:               p.name,
      category:           p.poi_categories?.display_name ?? 'Unknown',
      tags:               p.tags ?? [],
      source_type:        p.source_type,
      narration_cache:    p.narration_cache,
      significance_score: typeof p.significance_score === 'number' ? p.significance_score : null,
    });
  }
  return out;
}

// ── Query top (mode, depth) combos from trips ──────────────────────────────────
async function fetchTopCombos(limit: number): Promise<Array<{ mode: NarrationMode; depth: NarrationDepth }>> {
  // trips table may not store mode separately; derive from trip_mode or default to driving.
  // We select the top depths used and pair with both driving + hiking modes.
  const { data, error } = await getAdminClient()
    .from('trips')
    .select('depth')
    .not('depth', 'is', null)
    .limit(500);

  if (error || !data?.length) {
    // No trip history — use the full cross product as a safe default
    return [
      { mode: 'driving', depth: 'glance' },
      { mode: 'driving', depth: 'ride_along' },
      { mode: 'driving', depth: 'deep_dive' },
      { mode: 'hiking',  depth: 'ride_along' },
      { mode: 'hiking',  depth: 'glance' },
    ].slice(0, limit);
  }

  // Count by depth
  const depthCounts = new Map<string, number>();
  for (const row of data) {
    const d = row.depth as string;
    depthCounts.set(d, (depthCounts.get(d) ?? 0) + 1);
  }

  const topDepths = [...depthCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([d]) => d as NarrationDepth)
    .slice(0, 3);

  const combos: Array<{ mode: NarrationMode; depth: NarrationDepth }> = [];
  for (const depth of topDepths) {
    combos.push({ mode: 'driving', depth });
    if (combos.length < limit) combos.push({ mode: 'hiking', depth });
  }
  return combos.slice(0, limit);
}

// ── Fetch active voice for the chosen audience ────────────────────────────────
// voice_configs.mode is the AUDIENCE taxonomy (family/kids/unfiltered/local) —
// distinct from --mode, which is the trip taxonomy (driving/hiking/city). A
// single run uses one audience voice across all trip-mode × depth combos.
//
// Fails loud on missing/duplicate rows for the same reasons as
// server/routes/narration.js lookupVoiceConfig — silent fallback would orphan
// generated audio under the wrong voice_id.
async function fetchActiveVoiceForAudience(audience: AudienceMode): Promise<VoiceConfigRow> {
  const { data, error } = await getAdminClient()
    .from('voice_configs')
    .select('mode, voice_id, provider, voice_settings')
    .eq('mode', audience)
    .eq('is_active', true);

  if (error) {
    throw new Error(`[precache] voice_configs query failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error(
      `[precache] no active voice configured for audience '${audience}' — ` +
      `run \`pnpm audition --commit --mode=${audience} --voice=<id>\` to set one`,
    );
  }
  if (data.length > 1) {
    // voice_configs has a partial unique index on (mode) WHERE is_active=true —
    // hitting >1 means the index is missing or has drifted. Surface it.
    throw new Error(
      `[precache] voice_configs has ${data.length} active rows for audience '${audience}' — partial unique index likely missing`,
    );
  }
  return data[0] as VoiceConfigRow;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  loadEnv();
  registerProvider(new GoogleTTSProvider());

  // Parse CLI args
  const args      = process.argv.slice(2);
  const get       = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const has       = (flag: string) => args.includes(flag);
  const dryRun    = has('--dry-run');
  const routeFile = get('--route-file');
  const namedRoute = get('--named-route');
  const corridorMi = parseFloat(get('--corridor-mi') ?? '10');
  const limitArg  = parseInt(get('--limit') ?? '0', 10);
  const modeFilter = get('--mode') as NarrationMode | undefined;
  const depthFilter = get('--depth') as NarrationDepth | undefined;
  const topNRaw    = get('--top-n');
  const minScoreRaw = get('--min-score');
  const maxScoreRaw = get('--max-score');
  const excludeIdsRaw = get('--exclude-ids');
  const excludeIds = new Set(
    excludeIdsRaw
      ? excludeIdsRaw.split(',').map(s => s.trim()).filter(Boolean)
      : [],
  );
  const audienceRaw = get('--audience');
  const audience: AudienceMode = (() => {
    if (audienceRaw === undefined) return 'family';  // default
    if ((AUDIENCES as readonly string[]).includes(audienceRaw)) return audienceRaw as AudienceMode;
    console.error(`[precache] invalid --audience '${audienceRaw}' — must be one of: ${AUDIENCES.join(', ')}`);
    process.exit(1);
  })();

  // Score bounds — accepted in both selection modes. Top-N pushes them into
  // the SQL query (server-side filter); corridor applies them post-fetch
  // because the RPC doesn't carry a significance threshold.
  const minScore: number | null = minScoreRaw !== undefined ? parseFloat(minScoreRaw) : null;
  const maxScore: number | null = maxScoreRaw !== undefined ? parseFloat(maxScoreRaw) : null;
  if ((minScore !== null && !Number.isFinite(minScore)) ||
      (maxScore !== null && !Number.isFinite(maxScore)) ||
      (minScore !== null && maxScore !== null && minScore > maxScore)) {
    console.error(
      `[precache] invalid --min-score/--max-score (min=${minScore} max=${maxScore})`,
    );
    process.exit(1);
  }

  // ── Selection-mode validation ──────────────────────────────────────────────
  // top-N and corridor are mutually exclusive: top-N selects globally by
  // significance, corridor selects spatially. Combining them would silently
  // drop one set of constraints.
  const corridorMode = Boolean(routeFile || namedRoute);
  const topNMode     = topNRaw !== undefined;

  if (corridorMode && topNMode) {
    console.error(
      '[precache] --top-n is mutually exclusive with --route-file / --named-route. ' +
      'Specify exactly one selection mode.',
    );
    process.exit(1);
  }
  if (!corridorMode && !topNMode) {
    console.error(
      'Usage: tsx precache-popular-routes.ts (--route-file <path>|--named-route <id>|--top-n <n>) [options]',
    );
    console.error('Named routes:', Object.keys(NAMED_ROUTES).join(', '));
    process.exit(1);
  }

  // ── Fetch POIs ─────────────────────────────────────────────────────────────
  let pois: POIRow[];
  let selectionLabel: string;

  if (topNMode) {
    const topN = parseInt(topNRaw!, 10);
    if (!Number.isFinite(topN) || topN <= 0) {
      console.error(`[precache] --top-n must be a positive integer (got: ${topNRaw})`);
      process.exit(1);
    }
    // Top-N pushes score bounds into the SQL query — defaults match
    // significance_score's natural range.
    const sqlMin = minScore ?? 0;
    const sqlMax = maxScore ?? 100;
    selectionLabel =
      `top-${topN} by significance (score in [${sqlMin}, ${sqlMax}])`;
    console.log(`\n[precache] Selection: ${selectionLabel}  dry-run: ${dryRun}`);
    console.log('[precache] Fetching POIs...');
    pois = await fetchTopPOIs(topN, sqlMin, sqlMax);
    console.log(`[precache] ${pois.length} POIs returned (filters: merged_into IS NULL, parent_poi_id IS NULL, confidence_score >= 0.5, source_type != narrative_extracted)`);
  } else {
    let routeWkt: string;
    if (namedRoute) {
      if (!(namedRoute in NAMED_ROUTES)) {
        console.error(`Unknown named route '${namedRoute}'. Available: ${Object.keys(NAMED_ROUTES).join(', ')}`);
        process.exit(1);
      }
      routeWkt = NAMED_ROUTES[namedRoute] ?? '';
    } else {
      routeWkt = geojsonToWkt(resolve(routeFile!));
    }
    selectionLabel = `corridor along ${namedRoute ?? routeFile} (${corridorMi}mi)`;
    console.log(`\n[precache] Selection: ${selectionLabel}  dry-run: ${dryRun}`);
    console.log('[precache] Fetching POIs...');
    pois = await fetchPOIs(routeWkt, corridorMi);
    console.log(`[precache] ${pois.length} POIs found in corridor`);

    // Skip narrative_extracted — those need user validation first
    pois = pois.filter(p => p.source_type !== 'narrative_extracted');
    if (limitArg > 0) pois = pois.slice(0, limitArg);
    console.log(`[precache] ${pois.length} POIs eligible (narrative_extracted excluded)`);

    // Apply --min-score / --max-score post-fetch (corridor RPC has no
    // significance threshold). Drops rows missing a score — without one the
    // request to be ≥ minScore is unverifiable, so safer to exclude.
    if (minScore !== null || maxScore !== null) {
      const before = pois.length;
      const lo = minScore ?? 0;
      const hi = maxScore ?? 100;
      pois = pois.filter(p =>
        p.significance_score !== null &&
        p.significance_score >= lo &&
        p.significance_score <= hi,
      );
      console.log(`[precache] ${pois.length} POIs after score filter [${lo}, ${hi}] (dropped ${before - pois.length})`);
    }
  }

  // 1a. Apply --exclude-ids (manual exclusion of known bad selections).
  // Runs after selection (corridor or top-N) and after narrative_extracted
  // filtering, before significance preview / generation. The reported "missing"
  // count surfaces typos in the supplied IDs (UUID not in the selected set
  // means the exclude is a no-op for this run).
  if (excludeIds.size > 0) {
    const before  = pois.length;
    const present = new Set(pois.filter(p => excludeIds.has(p.id)).map(p => p.id));
    pois = pois.filter(p => !excludeIds.has(p.id));
    const dropped = before - pois.length;
    const missing = [...excludeIds].filter(id => !present.has(id));
    console.log(`[precache] --exclude-ids dropped ${dropped} POI(s)${missing.length ? `; ${missing.length} not in selected set: ${missing.join(', ')}` : ''}`);
  }

  // 2. Determine (mode, depth) combos
  let combos = await fetchTopCombos(5);
  if (modeFilter) combos = combos.filter(c => c.mode === modeFilter);
  if (depthFilter) combos = combos.filter(c => c.depth === depthFilter);
  console.log('[precache] Mode×depth combos:', combos.map(c => `${c.mode}/${c.depth}`).join(', '));

  // 3. Dry-run preview: top-5 by significance + estimated cost.
  // Printed before voice resolution so the sanity check is visible even when
  // voice_configs is unseeded (the resolution check still fires below and
  // exits the script — expected per PR A's fail-loud behavior).
  if (dryRun) {
    const previewRows = [...pois]
      .sort((a, b) => (b.significance_score ?? -1) - (a.significance_score ?? -1))
      .slice(0, 5);
    if (previewRows.length > 0) {
      console.log('\n[precache] Top 5 by significance_score (sanity check):');
      for (const p of previewRows) {
        const score = p.significance_score === null ? '?' : p.significance_score.toFixed(0);
        console.log(`    ${score.padStart(3)}  ${p.name}`);
      }
    }
    const perPoiUsd = combos.reduce((s, c) => s + estimateCostForCombo(c.depth), 0);
    const estUsd    = pois.length * perPoiUsd;
    console.log(`\n[precache] Estimated upper-bound cost: $${estUsd.toFixed(4)} (${pois.length} POIs × ${combos.length} combos; assumes none are cache hits — actual will be lower)`);
  }

  // 4. Active voice for the chosen audience — fail loud if unseeded.
  // One audience voice covers every trip-mode × depth combo in this run.
  const voiceConfig = await fetchActiveVoiceForAudience(audience);
  console.log(`[precache] Voice (${audience}): ${voiceConfig.provider}/${voiceConfig.voice_id}`);

  // 5. Process each POI × combo
  let generated = 0, skipped = 0, failed = 0;

  for (const poi of pois) {
    for (const { mode, depth } of combos) {
      const voiceId     = voiceConfig.voice_id;
      const cacheKey    = `${mode}-${depth}-${voiceId}`;

      // Check pois.narration_cache (fastest)
      if (poi.narration_cache?.[cacheKey]) {
        skipped++;
        continue;
      }

      // Check narration_audio table (only count ready rows — pending/failed are not usable)
      const { data: existing } = await getAdminClient()
        .from('narration_audio')
        .select('id')
        .eq('poi_id', poi.id)
        .eq('narrator_slug', voiceId)
        .eq('depth', depth)
        .eq('status', 'ready')
        .limit(1)
        .single();

      if (existing) {
        skipped++;
        continue;
      }

      if (dryRun) {
        console.log(`  [dry-run] would generate: ${poi.name} / ${mode} / ${depth} / ${voiceId}`);
        generated++;
        continue;
      }

      try {
        // Generate narration text via Claude
        const { text, inputTokens, outputTokens } = await generateText(poi, depth);
        const claudeCost = (inputTokens * 3 + outputTokens * 15) / 1_000_000;

        // Generate TTS audio via Google
        const ttsOutput = await generateNarration({
          text, mode, depth,
          voiceConfigOverride: {
            provider: voiceConfig.provider as 'google',
            voiceId,
            speakingRate: voiceConfig.voice_settings?.speakingRate,
          },
        });
        if (!ttsOutput) throw new Error('TTS generation returned null');

        const ttsCost = ttsOutput.costUsd;

        // Upload to Storage
        const audioUrl = await uploadAudio(poi.id, mode, depth, ttsOutput.voiceId, ttsOutput.audioBuffer);

        // Upsert narration_audio row
        const narrationId = await upsertNarrationAudio({
          poiId: poi.id, voiceId: ttsOutput.voiceId, depth, mode,
          audioUrl, charCount: ttsOutput.characterCount, costUsd: ttsCost,
          narrationText: text,
        });

        // Update pois.narration_cache
        await patchNarrationCache(poi.id, `${mode}-${depth}-${ttsOutput.voiceId}`, audioUrl);

        // Log costs
        await Promise.all([
          logCost({ callType: 'claude', provider: 'anthropic', modelOrVoice: 'claude-sonnet-4-6', inputTokens, outputTokens, costUsd: claudeCost, relatedId: narrationId }),
          logCost({ callType: 'tts', provider: 'google', modelOrVoice: ttsOutput.voiceId, inputChars: ttsOutput.characterCount, costUsd: ttsCost, relatedId: narrationId }),
        ]);

        console.log(`  ✓ ${poi.name} / ${mode} / ${depth}  ($${(claudeCost + ttsCost).toFixed(4)})`);
        generated++;

        // Brief pause to stay within API rate limits
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.error(`  ✗ ${poi.name} / ${mode} / ${depth}:`, (err as Error).message);
        failed++;
      }
    }
  }

  console.log(`\n[precache] Done — generated: ${generated}  skipped: ${skipped}  failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error('[precache] Fatal:', err); process.exit(1); });
