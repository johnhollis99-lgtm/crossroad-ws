/**
 * scripts/precache-popular-routes.ts
 *
 * Pre-generates narration audio for all POIs along a route, covering the
 * most-used (mode, depth) combinations from the trips table.
 *
 * Run:
 *   cd scripts
 *   npx tsx precache-popular-routes.ts --route-file ./routes/pch.geojson
 *   npx tsx precache-popular-routes.ts --named-route pch-sf-la
 *   npx tsx precache-popular-routes.ts --route-file ./routes/pch.geojson --dry-run
 *   npx tsx precache-popular-routes.ts --route-file ./routes/pch.geojson --mode driving --depth glance
 *
 * Options:
 *   --route-file <path>   GeoJSON file containing a Feature/FeatureCollection/LineString
 *   --named-route <id>    One of the built-in popular routes (see NAMED_ROUTES below)
 *   --corridor-mi <n>     Corridor width in miles (default: 10)
 *   --mode <m>            Restrict to a single trip mode (driving|hiking)
 *   --depth <d>           Restrict to a single depth (glance|ride_along|deep_dive)
 *   --dry-run             Print what would be generated without actually generating
 *   --limit <n>           Max POIs to process (default: unlimited)
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
type NarrationDepth = 'glance' | 'ride_along' | 'deep_dive';

interface POIRow {
  id: string;
  name: string;
  category: string;
  tags: string[];
  source_type: string | null;
  narration_cache: Record<string, string> | null;
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
};

const STORAGE_BUCKET  = 'narration-audio';
const PROMPT_VERSION  = 1;
const ANTHROPIC_BASE  = 'https://api.anthropic.com/v1';

const DEPTH_CFG: Record<NarrationDepth, { sentences: string; maxTokens: number }> = {
  glance:     { sentences: '1-2 sentences',  maxTokens: 400  },
  ride_along: { sentences: 'one paragraph',  maxTokens: 600  },
  deep_dive:  { sentences: '2-3 paragraphs', maxTokens: 1100 },
};

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
  audioUrl: string; charCount: number; costUsd: number;
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

// ── Query POIs along route ─────────────────────────────────────────────────────
async function fetchPOIs(routeWkt: string, corridorMi: number): Promise<POIRow[]> {
  const { data, error } = await getAdminClient().rpc('get_corridor_pois', {
    route_geom:           routeWkt,
    corridor_width_miles: corridorMi,
    category_filter:      null,
    mode_filter:          null,
  });

  if (error) throw new Error(`get_corridor_pois failed: ${error.message}`);

  // Re-fetch full POI rows to get narration_cache and source_type
  const ids = (data as { id: string }[]).map(r => r.id);
  if (ids.length === 0) return [];

  const { data: pois, error: poiErr } = await getAdminClient()
    .from('pois')
    .select('id, name, tags, source_type, narration_cache, poi_categories!inner(display_name)')
    .in('id', ids);

  if (poiErr) throw new Error(`POI detail fetch failed: ${poiErr.message}`);
  return (pois ?? []).map((p: any) => ({
    id:              p.id,
    name:            p.name,
    category:        p.poi_categories?.display_name ?? 'Unknown',
    tags:            p.tags ?? [],
    source_type:     p.source_type,
    narration_cache: p.narration_cache,
  }));
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

// ── Fetch active voice per mode ────────────────────────────────────────────────
// Mirrors server/routes/narration.js lookupVoiceConfig: surface query errors
// rather than swallowing them. Caller validates that every required mode
// produced a row (see assertVoicesForModes below).
async function fetchActiveVoices(modes: NarrationMode[]): Promise<Map<NarrationMode, VoiceConfigRow>> {
  const { data, error } = await getAdminClient()
    .from('voice_configs')
    .select('mode, voice_id, provider, voice_settings')
    .in('mode', modes)
    .eq('is_active', true);

  if (error) {
    throw new Error(`[precache] voice_configs query failed: ${error.message}`);
  }

  const map = new Map<NarrationMode, VoiceConfigRow>();
  for (const row of (data ?? []) as VoiceConfigRow[]) map.set(row.mode as NarrationMode, row);
  return map;
}

// Fail loud when any requested mode lacks an active voice_configs row.
// Parity with server/routes/narration.js lookupVoiceConfig — silent fallback
// would orphan generated audio under the wrong voice_id once audition commits
// a real voice.
function assertVoicesForModes(
  voiceMap: Map<NarrationMode, VoiceConfigRow>,
  modes: NarrationMode[],
): void {
  const missing = modes.filter(m => !voiceMap.has(m));
  if (missing.length > 0) {
    throw new Error(
      `[precache] no active voice configured for mode(s): ${missing.join(', ')} — run \`pnpm audition --commit\` to set one`,
    );
  }
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

  if (!routeFile && !namedRoute) {
    console.error('Usage: tsx precache-popular-routes.ts --route-file <path>|--named-route <id> [options]');
    console.error('Named routes:', Object.keys(NAMED_ROUTES).join(', '));
    process.exit(1);
  }

  let routeWkt: string;
  if (namedRoute) {
    if (!(namedRoute in NAMED_ROUTES)) {
      console.error(`Unknown named route '${namedRoute}'. Available: ${Object.keys(NAMED_ROUTES).join(', ')}`);
      process.exit(1);
    }
    routeWkt = NAMED_ROUTES[namedRoute];
  } else {
    routeWkt = geojsonToWkt(resolve(routeFile!));
  }

  console.log(`\n[precache] Route: ${namedRoute ?? routeFile}  corridor: ${corridorMi}mi  dry-run: ${dryRun}`);

  // 1. Fetch POIs along the route
  console.log('[precache] Fetching POIs...');
  let pois = await fetchPOIs(routeWkt, corridorMi);
  console.log(`[precache] ${pois.length} POIs found`);

  // Skip narrative_extracted — those need user validation first
  pois = pois.filter(p => p.source_type !== 'narrative_extracted');
  if (limitArg > 0) pois = pois.slice(0, limitArg);
  console.log(`[precache] ${pois.length} POIs eligible (narrative_extracted excluded)`);

  // 2. Determine (mode, depth) combos
  let combos = await fetchTopCombos(5);
  if (modeFilter) combos = combos.filter(c => c.mode === modeFilter);
  if (depthFilter) combos = combos.filter(c => c.depth === depthFilter);
  console.log('[precache] Mode×depth combos:', combos.map(c => `${c.mode}/${c.depth}`).join(', '));

  // 3. Active voice per mode — fail loud if any required mode is unseeded
  const modes = [...new Set(combos.map(c => c.mode))];
  const voiceMap = await fetchActiveVoices(modes);
  assertVoicesForModes(voiceMap, modes);

  // 4. Process each POI × combo
  let generated = 0, skipped = 0, failed = 0;

  for (const poi of pois) {
    for (const { mode, depth } of combos) {
      const voiceConfig = voiceMap.get(mode)!;
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
