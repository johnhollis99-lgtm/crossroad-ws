import { logCost } from './cost-tracker.js';
import type {
  CostRecord,
  GenerateNarrationOptions,
  ProviderName,
  TTSInput,
  TTSOutput,
  TTSProvider,
  VoiceConfig,
} from './types.js';

const PROVIDER_REGISTRY = new Map<ProviderName, TTSProvider>();

export function registerProvider(provider: TTSProvider): void {
  PROVIDER_REGISTRY.set(provider.name, provider);
}

export function getProvider(name: ProviderName): TTSProvider {
  const p = PROVIDER_REGISTRY.get(name);
  if (!p) throw new Error(`TTS provider '${name}' is not registered`);
  return p;
}

// Delays between retry attempts: attempt 1→2, 2→3, 3→4
export const RETRY_DELAYS_MS: readonly number[] = [1_000, 4_000, 16_000];

// Phase 9b: replace with voice_configs table lookup keyed on (mode, depth)
const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  provider: 'google',
  voiceId: 'en-US-Chirp3-HD-Aoede',
};

/**
 * Generates a narration audio buffer for the given text and trip context.
 * Retries up to 4 times (3 retries) with exponential backoff.
 * Logs cost to llm_calls on success (fire-and-forget).
 * Returns null when all attempts fail — caller decides whether to skip or defer.
 */
export async function generateNarration(
  opts: GenerateNarrationOptions,
): Promise<TTSOutput | null> {
  const voiceConfig = opts.voiceConfigOverride ?? DEFAULT_VOICE_CONFIG;
  const providerName = opts.providerOverride ?? voiceConfig.provider;
  const provider = getProvider(providerName);

  const input: TTSInput = {
    text: opts.text,
    voiceId: voiceConfig.voiceId,
    speakingRate: voiceConfig.speakingRate,
    pitch: voiceConfig.pitch,
    modelOverride: voiceConfig.modelOverride,
    outputFormat: 'opus',
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const output = await provider.generateNarration(input);

      const costRecord: CostRecord = {
        callType: 'tts',
        provider: output.provider,
        modelOrVoice: output.voiceId,
        inputChars: output.characterCount,
        costUsd: output.costUsd,
      };
      logCost(costRecord).catch(err =>
        console.error('[generateNarration] logCost failed:', err),
      );

      return output;
    } catch (err) {
      lastError = err;
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay !== undefined) {
        await new Promise<void>(r => setTimeout(r, delay));
      }
    }
  }

  console.error('[generateNarration] all attempts failed:', lastError);
  return null;
}

export type {
  TTSProvider,
  TTSInput,
  TTSOutput,
  VoiceMetadata,
  VoiceConfig,
  ProviderName,
  GenerateNarrationOptions,
  CostRecord,
} from './types.js';
