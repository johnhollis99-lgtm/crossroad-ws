import { config as dotenvConfig } from 'dotenv';
import path from 'path';

// Load from project root — 4 dirs up from scripts/lib/tts/__tests__/
dotenvConfig({ path: path.resolve(__dirname, '..', '..', '..', '..', '.env') });

import { createClient } from '@supabase/supabase-js';
import { GoogleTTSProvider } from '../providers/google';
import { logCost } from '../cost-tracker';

const HAS_GOOGLE = !!process.env['GOOGLE_APPLICATION_CREDENTIALS'];
const HAS_SUPABASE =
  !!(process.env['SUPABASE_URL'] && process.env['SUPABASE_SERVICE_ROLE_KEY']);

const TEST_SENTENCE =
  'The Golden Gate Bridge, completed in 1937, stretches 1.7 miles across the mouth of San Francisco Bay.';

describe('Google TTS — integration', () => {
  (HAS_GOOGLE ? it : it.skip)(
    'generates a real Opus narration, validates output shape, and logs cost',
    async () => {
      const provider = new GoogleTTSProvider();

      const output = await provider.generateNarration({
        text: TEST_SENTENCE,
        voiceId: 'en-US-Chirp3-HD-Aoede',
        outputFormat: 'opus',
      });

      // ── Opus output ────────────────────────────────────────────────────────
      expect(output.mimeType).toBe('audio/ogg; codecs=opus');
      expect(output.audioBuffer).toBeInstanceOf(Buffer);
      expect(output.audioBuffer.length).toBeGreaterThan(0);

      // ── Non-zero duration ──────────────────────────────────────────────────
      expect(output.durationMs).toBeGreaterThan(0);

      // ── Cost > 0 ───────────────────────────────────────────────────────────
      expect(output.costUsd).toBeGreaterThan(0);
      expect(output.characterCount).toBe(TEST_SENTENCE.length);
      expect(output.provider).toBe('google');

      console.log('\nTTSOutput:', {
        mimeType:       output.mimeType,
        voiceId:        output.voiceId,
        durationMs:     output.durationMs,
        characterCount: output.characterCount,
        costUsd:        `$${output.costUsd.toFixed(8)}`,
        bufferBytes:    output.audioBuffer.length,
      });

      // ── DB cost logging ────────────────────────────────────────────────────
      if (!HAS_SUPABASE) {
        console.warn('Skipping llm_calls verification — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
        return;
      }

      await logCost({
        callType:     'tts',
        provider:     output.provider,
        modelOrVoice: output.voiceId,
        inputChars:   output.characterCount,
        costUsd:      output.costUsd,
      });

      const supabase = createClient(
        process.env['SUPABASE_URL']!,
        process.env['SUPABASE_SERVICE_ROLE_KEY']!,
        { auth: { persistSession: false } },
      );

      const { data, error } = await supabase
        .from('llm_calls')
        .select('id, call_type, provider, model_or_voice, input_chars, cost_usd, created_at')
        .eq('call_type', 'tts')
        .eq('provider', 'google')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error?.message.includes('does not exist')) {
        console.warn('llm_calls table not yet created — apply migration 20260504000010');
        return;
      }

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(Number(data!.cost_usd)).toBeGreaterThan(0);

      console.log('\nSample llm_calls row:', data);
    },
    30_000,
  );

  it('skips gracefully when GOOGLE_APPLICATION_CREDENTIALS is unset', () => {
    if (HAS_GOOGLE) {
      console.log('(credentials present — real test ran above)');
      return;
    }
    console.warn(
      'Set GOOGLE_APPLICATION_CREDENTIALS=<path-to-service-account.json> to enable integration test',
    );
    expect(true).toBe(true);
  });
});
