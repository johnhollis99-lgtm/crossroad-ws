'use strict';

/**
 * POST /api/narration/generate
 *   Body: { poi_id, poi_name, poi_category, poi_tags, mode, depth, voice_id }
 *   Returns: { audio_url }
 *
 * POST /api/narration/preview
 *   Body: { text, voice_id }
 *   Returns: { audio_url }
 *
 * Both endpoints:
 *   - Generate audio via Google Cloud TTS
 *   - Upload to Supabase Storage bucket 'narration-audio'
 *   - /generate also: inserts narration_audio row, updates pois.narration_cache,
 *     calls Claude for the narration text first, logs llm_calls for both
 */

const express  = require('express');
const router   = express.Router();
const TextToSpeechClient = require('@google-cloud/text-to-speech').TextToSpeechClient;
const { supabase } = require('../lib/supabase');

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';
const STORAGE_BUCKET = 'narration-audio';
const PROMPT_VERSION = 1;

// ── Depth config (mirrors narration-engine.js) ────────────────────────────────
const DEPTH_CFG = {
  glance:     { sentences: '1-2 sentences',   maxTokens: 400  },
  ride_along: { sentences: 'one paragraph',   maxTokens: 600  },
  deep_dive:  { sentences: '2-3 paragraphs',  maxTokens: 1100 },
};

// ── Google TTS client (reads GOOGLE_APPLICATION_CREDENTIALS automatically) ────
let ttsClient;
function getTTSClient() {
  if (!ttsClient) ttsClient = new TextToSpeechClient();
  return ttsClient;
}

// ── Voice config lookup (Fix 1: fail loud — no silent fallback) ───────────────
// Mirrors useTTS.ts lookupVoiceConfig. Throws when voice_configs has no active
// row for the requested mode so the caller gets a clear error instead of
// generating audio under an unintended voice_id.
async function lookupVoiceConfig(mode) {
  const { data, error } = await supabase
    .from('voice_configs')
    .select('voice_id, provider, voice_settings')
    .eq('mode', mode)
    .eq('is_active', true)
    .single();

  if (error) {
    throw new Error(`[narration] voice_configs query failed for mode '${mode}': ${error.message}`);
  }
  if (!data) {
    throw new Error(
      `[narration] no active voice configured for mode '${mode}' — run pnpm audition --commit to set one`,
    );
  }
  return { voiceId: data.voice_id, provider: data.provider };
}

// ── Claude narration text generation ─────────────────────────────────────────
async function generateNarrationText({ poi_name, poi_category, poi_tags, depth }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const cfg = DEPTH_CFG[depth] ?? DEPTH_CFG.ride_along;
  const tagLine = poi_tags?.length ? `Context tags: ${poi_tags.slice(0, 6).join(', ')}.` : '';

  const systemPrompt =
    `You are an engaging road trip narrator for a GPS app. ` +
    `Generate SPOKEN audio narration only — no markdown, no bullet points, no section headers. ` +
    `Write exactly as you would speak aloud to someone in a moving vehicle.`;

  const userPrompt =
    `Narrate this point of interest for a driver:\n` +
    `Name: ${poi_name}\nCategory: ${poi_category}\n${tagLine}\n\n` +
    `Length: ${cfg.sentences}. ` +
    `Open with the most interesting thing — no warm-up phrases like "So..." or "Well...". ` +
    `Speak directly to the driver in present tense. No intro announcement — start mid-story.`;

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
      messages:   [{ role: 'user', content: userPrompt }],
      system:     systemPrompt,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${body}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text?.trim() ?? '';
  if (!text) throw new Error('Claude returned empty narration');

  return {
    text,
    inputTokens:  data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

// ── Google Cloud TTS synthesis → OGG Opus buffer ─────────────────────────────
async function synthesizeAudio(text, voiceId, speakingRate = 1.0) {
  const client  = getTTSClient();
  const DEFAULT_FALLBACK = 'en-US-Neural2-D';

  const audioConfig = { audioEncoding: 'OGG_OPUS', speakingRate };

  let audioContent;
  let usedVoiceId = voiceId;

  try {
    const [response] = await client.synthesizeSpeech({
      input:       { text },
      voice:       { languageCode: 'en-US', name: voiceId },
      audioConfig,
    });
    if (!response.audioContent) throw new Error('Empty audioContent from Google TTS');
    audioContent = response.audioContent;
  } catch {
    // HD voice unavailable — fall back to Neural2
    if (voiceId.includes('Chirp3-HD')) {
      const [fallback] = await client.synthesizeSpeech({
        input:       { text },
        voice:       { languageCode: 'en-US', name: DEFAULT_FALLBACK },
        audioConfig,
      });
      if (!fallback.audioContent) throw new Error('Google TTS fallback returned empty audioContent');
      audioContent = fallback.audioContent;
      usedVoiceId  = DEFAULT_FALLBACK;
    } else {
      throw new Error(`Google TTS failed for voice ${voiceId}`);
    }
  }

  return { audioBuffer: Buffer.from(audioContent), usedVoiceId };
}

// ── Cost estimate for Google TTS ──────────────────────────────────────────────
function estimateTTSCost(charCount, voiceId) {
  const isHD       = voiceId.includes('Chirp3-HD');
  const isPremium  = voiceId.includes('Neural2') || voiceId.includes('WaveNet');
  const ratePerM   = isHD ? 16 : isPremium ? 16 : 4;
  return (charCount / 1_000_000) * ratePerM;
}

// ── Upload audio buffer to Supabase Storage ───────────────────────────────────
async function uploadAudio(poiId, mode, depth, voiceId, audioBuffer) {
  const storagePath = `${poiId}/${mode}/${depth}/${voiceId}.opus`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, audioBuffer, {
      contentType: 'audio/ogg; codecs=opus',
      upsert:      true,
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
  return { audioUrl: data.publicUrl, storagePath };
}

// ── Phase 1: insert pending row before generation begins (Fix 2) ─────────────
// Upserts status='pending' so a row exists with a stable ID for cost tracking.
// Caller must have already confirmed no 'ready' row exists (hook cache lookup).
// audienceMode added 2026-05-19 (H1.6.2) — required column per migration
// 20260519000002 widening na_unique to include audience_mode.
async function insertNarrationAudioPending({ poiId, voiceId, depth, mode, audienceMode }) {
  const { data, error } = await supabase
    .from('narration_audio')
    .upsert(
      {
        poi_id:         poiId,
        narrator_slug:  voiceId,
        depth,
        mode,
        audience_mode:  audienceMode,
        audio_url:      null,
        status:         'pending',
        provider:       'google',
        prompt_version: PROMPT_VERSION,
        generated_at:   new Date().toISOString(),
      },
      { onConflict: 'poi_id,region_id,narrator_slug,audience_mode,depth,mode', ignoreDuplicates: false },
    )
    .select('id')
    .single();

  if (error) throw new Error(`narration_audio pending insert failed: ${error.message}`);
  return data?.id;
}

// ── Phase 2: promote pending row to ready after upload completes (Fix 2) ──────
async function updateNarrationAudioReady({ id, audioUrl, charCount, costUsd, durationMs, narrationText }) {
  const { error } = await supabase
    .from('narration_audio')
    .update({
      status:          'ready',
      audio_url:       audioUrl,
      character_count: charCount,
      cost_usd:        costUsd,
      duration_ms:     durationMs,
      narration_text:  narrationText,
    })
    .eq('id', id);

  if (error) throw new Error(`narration_audio ready update failed: ${error.message}`);
}

// ── Update pois.narration_cache JSON field ────────────────────────────────────
async function updatePoiNarrationCache(poiId, mode, depth, voiceId, audioUrl) {
  const cacheKey = `${mode}-${depth}-${voiceId}`;

  // jsonb_set with create_missing=true — safe concurrent update
  const { error } = await supabase.rpc('update_poi_narration_cache', {
    p_poi_id:    poiId,
    p_cache_key: cacheKey,
    p_audio_url: audioUrl,
  });

  if (error) {
    // RPC may not exist yet — fall back to a direct update
    const { data: existing } = await supabase
      .from('pois')
      .select('narration_cache')
      .eq('id', poiId)
      .single();

    const merged = { ...(existing?.narration_cache ?? {}), [cacheKey]: audioUrl };
    await supabase.from('pois').update({ narration_cache: merged }).eq('id', poiId);
  }
}

// ── Log cost to llm_calls ─────────────────────────────────────────────────────
async function logCost({ callType, provider, modelOrVoice, inputChars, inputTokens, outputTokens, costUsd, relatedId }) {
  await supabase.from('llm_calls').insert({
    call_type:      callType,
    provider,
    model_or_voice: modelOrVoice,
    input_chars:    inputChars ?? null,
    input_tokens:   inputTokens ?? null,
    output_tokens:  outputTokens ?? null,
    cost_usd:       costUsd,
    related_id:     relatedId ?? null,
  });
}

// ── POST /api/narration/generate ──────────────────────────────────────────────
router.post('/generate', async (req, res) => {
  const { poi_id, poi_name, poi_category, poi_tags, mode, depth } = req.body;
  // voice_id is optional — derived from voice_configs when absent (Fix 1)
  let { voice_id } = req.body;
  // audience_mode added 2026-05-19 (H1.6.2); defaults to 'family' to preserve
  // backward compatibility with v1 mobile clients that don't yet send it.
  const audience_mode = req.body.audience_mode || 'family';
  const ALLOWED_AUDIENCES = ['family', 'kids', 'unfiltered', 'local'];
  if (!ALLOWED_AUDIENCES.includes(audience_mode)) {
    return res.status(400).json({ error: `audience_mode must be one of ${ALLOWED_AUDIENCES.join(', ')}` });
  }

  if (!poi_id || !poi_name || !mode || !depth) {
    return res.status(400).json({ error: 'poi_id, poi_name, mode, depth are required' });
  }

  // Fix 1: look up voice from voice_configs if caller did not supply it (fails loud)
  if (!voice_id) {
    try {
      const cfg = await lookupVoiceConfig(mode);
      voice_id = cfg.voiceId;
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Fix 2: insert pending row first so we have a stable ID for cost tracking
  let pendingId;
  try {
    pendingId = await insertNarrationAudioPending({
      poiId: poi_id, voiceId: voice_id, depth, mode, audienceMode: audience_mode,
    });
  } catch (err) {
    console.error('[narration] pending insert failed:', err);
    return res.status(500).json({ error: err.message });
  }

  try {
    // 2. Generate narration text via Claude
    const { text, inputTokens, outputTokens } = await generateNarrationText({
      poi_name, poi_category, poi_tags, depth,
    });
    const claudeCostUsd = (inputTokens * 3 + outputTokens * 15) / 1_000_000;

    // Fix 3: one row per provider call — log Claude immediately (fire-and-forget)
    logCost({
      callType: 'claude', provider: 'anthropic', modelOrVoice: 'claude-sonnet-4-6',
      inputTokens, outputTokens, costUsd: claudeCostUsd, relatedId: pendingId,
    }).catch(err => console.error('[narration] logCost(claude) failed:', err));

    // 3. Synthesize audio via Google TTS
    const { audioBuffer, usedVoiceId } = await synthesizeAudio(text, voice_id);
    const charCount  = text.length;
    const ttsCostUsd = estimateTTSCost(charCount, usedVoiceId);
    const durationMs = Math.round((charCount / 14) * 1000);

    // Fix 3: log TTS immediately after synthesis (fire-and-forget)
    logCost({
      callType: 'tts', provider: 'google', modelOrVoice: usedVoiceId,
      inputChars: charCount, costUsd: ttsCostUsd, relatedId: pendingId,
    }).catch(err => console.error('[narration] logCost(tts) failed:', err));

    // 4. Upload to Supabase Storage
    const { audioUrl } = await uploadAudio(poi_id, mode, depth, usedVoiceId, audioBuffer);

    // 5. Promote row to ready (Fix 2: atomic write order)
    await updateNarrationAudioReady({
      id: pendingId, audioUrl, charCount, costUsd: ttsCostUsd, durationMs,
      narrationText: text,
    });

    // 6. Update pois.narration_cache (fire-and-forget)
    updatePoiNarrationCache(poi_id, mode, depth, usedVoiceId, audioUrl).catch(err =>
      console.error('[narration] narration_cache update failed:', err),
    );

    return res.json({ audio_url: audioUrl });
  } catch (err) {
    // Mark row as failed so the sweeper can clean up (Fix 2)
    // Do NOT delete the Storage object here — sweeper handles it.
    await supabase
      .from('narration_audio')
      .update({ status: 'failed' })
      .eq('id', pendingId)
      .catch(e => console.error('[narration] failed to mark row as failed:', e));

    console.error('[narration] /generate error:', err);
    return res.status(500).json({ error: err.message ?? 'Narration generation failed' });
  }
});

// ── POST /api/narration/preview ───────────────────────────────────────────────
// Synthesizes arbitrary text for voice preview on the filters screen.
// Uses the same Google TTS path but does NOT insert a narration_audio row.
router.post('/preview', async (req, res) => {
  const { text, voice_id } = req.body;
  if (!text || !voice_id) {
    return res.status(400).json({ error: 'text and voice_id are required' });
  }

  try {
    const { audioBuffer, usedVoiceId } = await synthesizeAudio(text, voice_id);

    // Upload to a transient preview path (overwritten on each call per voice)
    const storagePath = `preview/${usedVoiceId}.opus`;
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, audioBuffer, {
        contentType: 'audio/ogg; codecs=opus',
        upsert:      true,
      });
    if (error) throw new Error(`Preview upload failed: ${error.message}`);

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
    return res.json({ audio_url: data.publicUrl });
  } catch (err) {
    console.error('[narration] /preview error:', err);
    return res.status(500).json({ error: err.message ?? 'Preview generation failed' });
  }
});

module.exports = router;
