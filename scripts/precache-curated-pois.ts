/**
 * scripts/precache-curated-pois.ts
 *
 * Curator-gated TTS generation for the v1 launch slate per
 * docs/decisions/2026-05-15-top-tier-poi-first-run.md §Curation Model.
 *
 * Variant of precache-top-tier-pois.ts that gates on
 *   editorial_curated = TRUE
 * instead of significance_score >= 80 + EXCLUSION_NAMES. The hybrid
 * curation model has the curator commit per-POI decisions via
 * scripts/curation/import.ts; this script reads those committed
 * decisions and generates audio for the approved set.
 *
 * Single voice config: narrator_b × Family × Sadachbia 1.00 × standard.
 *
 * Pipeline (unchanged from precache-top-tier-pois.ts):
 *   Haiku (markers + digits) → ssmlize() → Google TTS → Storage
 *
 * Storage path (unchanged):
 *   pois/{poi_id}/narrator_b_family_standard.opus
 *
 *   Same SIDE-CHANNEL path as top-tier. narration_audio rows are NOT
 *   written by this script — those land via the curator-greenlit second
 *   pass once the audio is approved.
 *
 * Run (from project root):
 *   npx tsx scripts/precache-curated-pois.ts                # dry-run (default)
 *   npx tsx scripts/precache-curated-pois.ts --live         # generate
 *   npx tsx scripts/precache-curated-pois.ts --live --limit 5
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { registerProvider, generateNarration } from './lib/tts/index.js';
import { GoogleTTSProvider } from './lib/tts/providers/google.js';
import { ssmlize, stripMarkersAndTags, tallyMarkers } from './lib/tts/ssml.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { notifyTelegram } from './lib/telegram-notify.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(SCRIPT_DIR, '..', '.env');
const POI_TEMPLATES_PATH = resolve(SCRIPT_DIR, '..', 'server', 'prompts', 'pois', 'index.js');

const require = createRequire(import.meta.url);

// ── dotenv ─────────────────────────────────────────────────────────────────
function loadEnv(): void {
  if (!existsSync(ENV_PATH)) return;
  const raw = readFileSync(ENV_PATH, 'utf-8');
  for (const line of raw.split('\n')) {
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
}
loadEnv();

// ── Config (kept identical to precache-top-tier-pois.ts) ───────────────────
const NARRATOR_SLUG = 'narrator_b';
const AUDIENCE_MODE = 'family';
const DEPTH = 'standard';
const STORAGE_BUCKET = 'narration-audio';
const STORAGE_PREFIX = 'pois';
const FILE_SUFFIX = `${NARRATOR_SLUG}_${AUDIENCE_MODE}_${DEPTH}`;
const INTER_CALL_PAUSE_MS = 600;
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const HAIKU_MAX_TOKENS = 900;
const HAIKU_IN_PER_TOK = 1.0 / 1_000_000;
const HAIKU_OUT_PER_TOK = 5.0 / 1_000_000;

/**
 * Per-POI fact anchors — prepended to the description field passed to the
 * narrator template. Use for one-off factuality corrections where the
 * source description leaves a high-confidence-to-LLM fact ambiguous or
 * absent. Pattern is reusable for future similar discoveries.
 *
 * Keyed by POI id (UUID) for stability across name changes / dedup
 * outcomes. Build chat verifies each entry against an authoritative source
 * before adding.
 */
const FACT_OVERRIDES: Record<string, string> = {
  // Mount Whitney — geology editorial row (cycle-3 sampler review found
  // the prior render gave an incorrect distance to Badwater Basin).
  // ~84 miles is the canonical distance (88 mi / 142 km commonly cited;
  // ~84 is the GIS-direct figure used by NPS interpretive material).
  '6dbb1b74-7aac-4f1e-91ad-9df46391e1b0':
    'FACT ANCHOR: Mount Whitney sits about 84 miles west of Badwater Basin in Death Valley — the highest point in the contiguous United States and the lowest point in North America, separated by roughly that distance.',
};

// ── Args ───────────────────────────────────────────────────────────────────
interface Args { live: boolean; limit: number | null; }
function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const live = argv.includes('--live');
  const lf = argv.find(a => a.startsWith('--limit='));
  const limit = lf ? parseInt(lf.slice('--limit='.length), 10) : null;
  return { live, limit };
}

interface PoiRow {
  id: string;
  name: string;
  description: string | null;
  category_slug: string | null;
  category_display: string | null;
  significance_score: number;
  significance_breakdown: Record<string, number> | null;
  source_type: string | null;
  source_citation: string | null;
  tags: string[];
  editorial_score_boost: number;
}

interface VoiceRow {
  voice_id: string;
  voice_settings: { speakingRate?: number; pitch?: number };
}

function fail(msg: string): never {
  console.error(`FATAL: ${msg}`);
  process.exit(1);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const args = parseArgs();
  const isDryRun = !args.live;

  console.log('=== Curated POI TTS Run — narrator_b × Family / standard ===');
  console.log(`  Mode: ${isDryRun ? 'DRY-RUN (no Claude/TTS, no Storage)' : 'LIVE'}`);
  console.log(`  Gate: editorial_curated = TRUE`);
  console.log(`  Storage path: ${STORAGE_PREFIX}/{poi_id}/${FILE_SUFFIX}.opus`);
  console.log('');

  if (!isDryRun) {
    if (!process.env['ANTHROPIC_API_KEY']) fail('ANTHROPIC_API_KEY not set');
    if (!process.env['GOOGLE_APPLICATION_CREDENTIALS']) fail('GOOGLE_APPLICATION_CREDENTIALS not set');
  }
  if (!process.env['SUPABASE_URL']) fail('SUPABASE_URL not set');
  if (!process.env['SUPABASE_SERVICE_ROLE_KEY']) fail('SUPABASE_SERVICE_ROLE_KEY not set');

  const supabase: SupabaseClient = createClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } },
  );

  // Template lookup (same as top-tier — single voice, single template).
  // Signature changed in H1.5.1 (2026-05-19) — flat audience-keyed registry;
  // narrator_slug derivable from template.narratorSlug (NARRATOR_SLUG const
  // kept for Storage-path filename construction).
  const { pickPoiPrompt } = require(POI_TEMPLATES_PATH) as {
    pickPoiPrompt: (a: string, d: string) => {
      systemPrompt: string;
      buildUserPrompt: (poi: any) => string;
      narratorSlug: string;
    };
  };
  const template = pickPoiPrompt(AUDIENCE_MODE, DEPTH);

  // Voice config lookup
  const { data: voiceRows, error: vcErr } = await supabase
    .from('voice_configs')
    .select('voice_id, voice_settings')
    .eq('mode', AUDIENCE_MODE)
    .eq('narrator_slug', NARRATOR_SLUG)
    .eq('is_active', true)
    .limit(1);
  if (vcErr) fail(`voice_configs query: ${vcErr.message}`);
  if (!voiceRows || voiceRows.length === 0) fail(`no active voice_configs row for ${NARRATOR_SLUG} × ${AUDIENCE_MODE}`);
  const voice = voiceRows[0] as VoiceRow;
  console.log(`  Voice: ${voice.voice_id} @ rate ${voice.voice_settings?.speakingRate ?? 1.0}`);

  // POI fetch — gate on editorial_curated = TRUE.
  // Order: editorial_score_boost desc (boosted entries narrate first),
  // then significance_score desc, then name asc.
  let q = supabase
    .from('pois')
    .select(`
      id,
      name,
      description,
      tags,
      significance_score,
      significance_breakdown,
      source_type,
      source_citation,
      category_id,
      editorial_score_boost
    `)
    .is('merged_into', null)
    .eq('editorial_curated', true)
    .order('editorial_score_boost', { ascending: false })
    .order('significance_score', { ascending: false })
    .order('name', { ascending: true });
  if (args.limit) q = q.limit(args.limit);
  const { data: rawPois, error: pErr } = await q;
  if (pErr) fail(`pois query: ${pErr.message}`);

  // Category enrichment
  const catIds = Array.from(new Set((rawPois ?? []).map((r: any) => r.category_id).filter(Boolean)));
  const { data: cats } = await supabase
    .from('poi_categories')
    .select('id, slug, display_name')
    .in('id', catIds);
  const catMap = new Map<string, { slug: string; display_name: string }>();
  for (const c of cats ?? []) catMap.set(c.id, { slug: c.slug, display_name: c.display_name });

  const pois: PoiRow[] = (rawPois ?? []).map((r: any) => {
    const cat = catMap.get(r.category_id);
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      category_slug: cat?.slug ?? null,
      category_display: cat?.display_name ?? null,
      significance_score: r.significance_score,
      significance_breakdown: r.significance_breakdown,
      source_type: r.source_type,
      source_citation: r.source_citation,
      tags: r.tags ?? [],
      editorial_score_boost: r.editorial_score_boost ?? 0,
    };
  });

  console.log(`  POIs in scope: ${pois.length}`);
  console.log('');
  console.log('  === First 10 in scope ===');
  for (const p of pois.slice(0, 10)) {
    const eff = p.significance_score + p.editorial_score_boost;
    const boostStr = p.editorial_score_boost > 0 ? `+${p.editorial_score_boost}` : '   ';
    console.log(`    [${String(p.significance_score).padStart(3)}${boostStr}=${String(eff).padStart(3)}] ${p.category_slug?.padEnd(14)} ${p.name}`);
  }
  if (pois.length > 10) console.log(`    ... and ${pois.length - 10} more`);
  console.log('');

  const estCost = pois.length * 0.022;
  const estMinutes = Math.ceil((pois.length * 18) / 60);
  console.log(`  Estimated spend: $${estCost.toFixed(2)} (~$0.022 / POI Haiku+TTS)`);
  console.log(`  Estimated runtime: ~${estMinutes} min`);
  console.log('');

  if (isDryRun) {
    console.log(`  Run with --live to actually generate.`);
    return;
  }

  // LIVE generation loop
  registerProvider(new GoogleTTSProvider());
  const ANTHROPIC_API_KEY = process.env['ANTHROPIC_API_KEY']!;
  const stats = {
    generated: 0, failed: 0,
    haikuCost: 0, ttsCost: 0,
    skipTotal: 0,
    fallbacks: 0,
    parseRetries: 0,
    startedAt: Date.now(),
  };
  const results: Array<{ poi: PoiRow; url: string; narration: string; markers: ReturnType<typeof tallyMarkers>; haikuCost: number; ttsCost: number }> = [];
  const failures: Array<{ poi: PoiRow; reason: string }> = [];

  console.log('=== Generation loop ===');
  for (let i = 0; i < pois.length; i++) {
    const poi = pois[i]!;
    const eff = poi.significance_score + poi.editorial_score_boost;
    const label = `[${String(i + 1).padStart(3)}/${pois.length}] ${poi.name.slice(0, 38).padEnd(38)} eff=${String(eff).padStart(3)}`;
    process.stdout.write(`  ${label} `);

    try {
      // Per-POI fact-anchor injection. Prepended to the description so
      // the template's "Reference description (factual, neutral — your
      // primary grounding)" framing wraps it correctly. The anchor stays
      // a small, named augmentation; the bulk of the grounding stays
      // from the source description.
      const factAnchor = FACT_OVERRIDES[poi.id];
      const description = factAnchor
        ? `${factAnchor}\n\n${poi.description ?? ''}`
        : poi.description;

      const userPrompt = template.buildUserPrompt({
        name: poi.name,
        description,
        category_display: poi.category_display,
        tags: poi.tags,
        source_citation: poi.source_citation,
      });

      // Haiku — call-and-parse with single-shot retry on JSON parse failure.
      //
      // Background: cycle-3 + cycle-4 each hit ~1% Haiku output drift, where
      // the model returns prose-outside-JSON or unescaped newlines in the
      // narration string that break JSON.parse. Different POIs each cycle,
      // same failure class. A single retry with a tightened reminder
      // recovers most cases; the second-attempt prompt explicitly cites
      // "the previous response was unparseable" so the model corrects.
      //
      // Both attempts log to llm_calls so cost is tracked even for retries.
      // Empty narration also counts as a "needs retry" condition.
      let narrationText: string | null = null;
      let haikuCost = 0;
      let retryUsed = false;
      let lastParseErr: string | null = null;

      for (let attempt = 1; attempt <= 2; attempt++) {
        const systemForAttempt =
          attempt === 1
            ? template.systemPrompt
            : template.systemPrompt +
              '\n\nRETRY NOTE: The previous response could not be parsed as JSON. ' +
              'Return ONLY a single valid JSON object exactly matching the schema {"narration": "...", "key_themes": [...]}. ' +
              'No prose outside the JSON, no markdown fences, no commentary. ' +
              'Escape any embedded newlines or quotes inside the narration string.';

        const hr = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: HAIKU_MODEL,
            max_tokens: HAIKU_MAX_TOKENS,
            system: systemForAttempt,
            messages: [{ role: 'user', content: userPrompt }],
          }),
        });
        if (!hr.ok) {
          const errText = await hr.text().catch(() => '');
          throw new Error(`Haiku HTTP ${hr.status} (attempt ${attempt}): ${errText.slice(0, 200)}`);
        }
        const hj = (await hr.json()) as {
          content?: Array<{ type: string; text?: string }>;
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        const inTok = hj.usage?.input_tokens ?? 0;
        const outTok = hj.usage?.output_tokens ?? 0;
        const attemptCost = +(inTok * HAIKU_IN_PER_TOK + outTok * HAIKU_OUT_PER_TOK).toFixed(6);
        haikuCost += attemptCost;

        // Log every attempt to llm_calls (retry attempts disambiguated by
        // model_or_voice suffix for adherence-audit queries).
        await supabase.from('llm_calls').insert({
          call_type: 'claude',
          provider: 'anthropic',
          model_or_voice: attempt === 1 ? HAIKU_MODEL : `${HAIKU_MODEL}__parse_retry`,
          input_chars: (attempt === 1 ? userPrompt : userPrompt).length,
          input_tokens: inTok,
          output_tokens: outTok,
          cost_usd: attemptCost,
          related_id: null,
        });

        const raw = (hj.content ?? [])
          .filter(b => b.type === 'text')
          .map(b => b.text ?? '')
          .join('')
          .trim();
        const cleanedJson = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        try {
          const parsed = JSON.parse(cleanedJson) as { narration: string; key_themes?: string[] };
          if (!parsed.narration) {
            lastParseErr = 'empty narration field';
            continue; // retry path
          }
          narrationText = parsed.narration;
          if (attempt === 2) retryUsed = true;
          break;
        } catch (e: unknown) {
          lastParseErr = e instanceof Error ? e.message : String(e);
          // fall through to retry (if attempt 1) or throw (if attempt 2)
        }
      }

      if (!narrationText) {
        throw new Error(`Haiku JSON parse failed after retry: ${lastParseErr}`);
      }
      if (retryUsed) stats.parseRetries++;

      // SSML
      const { ssml, skips } = ssmlize(narrationText);
      const markerStats = tallyMarkers(narrationText, ssml);
      for (const s of skips) {
        stats.skipTotal++;
        await supabase.from('llm_calls').insert({
          call_type: 'tts',
          provider: 'google',
          model_or_voice: `ssmlize_skip_${s.type}`,
          input_chars: s.value.length,
          cost_usd: 0,
          related_id: null,
        });
      }

      // TTS with plain-text fallback on SSML parse failure
      let ttsOutput;
      let fallbackUsed = false;
      try {
        ttsOutput = await generateNarration({
          text: ssml,
          voiceConfigOverride: { provider: 'google', voiceId: voice.voice_id },
        });
      } catch {
        ttsOutput = null;
      }
      if (!ttsOutput) {
        fallbackUsed = true;
        stats.fallbacks++;
        await supabase.from('llm_calls').insert({
          call_type: 'tts',
          provider: 'google',
          model_or_voice: `${voice.voice_id}__SSML_PARSE_FAILED`,
          input_chars: ssml.length,
          cost_usd: 0,
          related_id: null,
        });
        const plain = stripMarkersAndTags(narrationText);
        ttsOutput = await generateNarration({
          text: plain,
          voiceConfigOverride: { provider: 'google', voiceId: voice.voice_id },
        });
        if (!ttsOutput) throw new Error('Plain-text fallback also failed');
      }

      const audioBuffer = Buffer.isBuffer(ttsOutput.audioBuffer)
        ? ttsOutput.audioBuffer
        : Buffer.from(ttsOutput.audioBuffer);
      const ttsCost = ttsOutput.costUsd;

      const storagePath = `${STORAGE_PREFIX}/${poi.id}/${FILE_SUFFIX}.opus`;
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, audioBuffer, { contentType: 'audio/ogg; codecs=opus', upsert: true });
      if (upErr) throw new Error(`Storage upload: ${upErr.message}`);
      const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

      stats.generated++;
      stats.haikuCost += haikuCost;
      stats.ttsCost += ttsCost;
      results.push({ poi, url: publicUrl, narration: narrationText, markers: markerStats, haikuCost, ttsCost });

      console.log(`OK ${markerStats.pause500}+${markerStats.pause250}m ${markerStats.ssmlBreaks}b ${markerStats.ssmlSayAs}sa skips=${skips.length} ${(audioBuffer.length / 1024).toFixed(0)}KB${fallbackUsed ? ' [FB]' : ''}${retryUsed ? ' [PR]' : ''}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAIL ${msg.slice(0, 80)}`);
      stats.failed++;
      failures.push({ poi, reason: msg });
    }

    if (i < pois.length - 1) await sleep(INTER_CALL_PAUSE_MS);
  }

  const runtimeMin = ((Date.now() - stats.startedAt) / 60000).toFixed(1);
  const totalCost = stats.haikuCost + stats.ttsCost;
  console.log('');
  console.log('=== SUMMARY ===');
  console.log(`  Generated: ${stats.generated}`);
  console.log(`  Failed:    ${stats.failed}`);
  console.log(`  Skips (Layer 2 highway/year): ${stats.skipTotal}`);
  console.log(`  SSML fallbacks: ${stats.fallbacks}`);
  console.log(`  Haiku parse retries: ${stats.parseRetries}`);
  console.log(`  Runtime:   ${runtimeMin} min`);
  console.log(`  Total spend: $${totalCost.toFixed(4)} (Claude $${stats.haikuCost.toFixed(4)} + TTS $${stats.ttsCost.toFixed(4)})`);
  if (failures.length > 0) {
    console.log('');
    console.log('  === FAILURES ===');
    for (const f of failures) console.log(`    ${f.poi.name.padEnd(40)} ${f.reason.slice(0, 100)}`);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  ALL SAMPLER URLs — for selection');
  console.log('═══════════════════════════════════════════════════════════════════');
  for (const r of results) {
    const eff = r.poi.significance_score + r.poi.editorial_score_boost;
    console.log(`- [${eff}] **${r.poi.name}** (${r.poi.category_slug})  ${r.url}`);
  }

  // Telegram ping
  await notifyTelegram(
    `Curated POI TTS run complete. ${stats.generated}/${pois.length} narrations generated, ${stats.failed} failures. ` +
    `Spend: $${totalCost.toFixed(2)}. Runtime: ${runtimeMin}min. Skips: ${stats.skipTotal} / Fallbacks: ${stats.fallbacks} / Parse retries: ${stats.parseRetries}. ` +
    `9 prioritized sampler URLs posted to build chat.`,
  );
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FATAL: ${msg}`);
  process.exit(1);
});
