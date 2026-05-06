import type { TTSInput, TTSOutput, TTSProvider, VoiceMetadata } from '../types.js';

// Requires: SELF_HOSTED_TTS_URL env var (HTTP endpoint returning raw audio bytes)
// TODO: implement when self-hosted model becomes active
export class SelfHostedTTSProvider implements TTSProvider {
  readonly name = 'self-hosted' as const;

  async generateNarration(_input: TTSInput): Promise<TTSOutput> {
    throw new Error('SelfHostedTTSProvider: not yet implemented');
  }

  async estimateCost(_input: TTSInput): Promise<number> {
    throw new Error('SelfHostedTTSProvider: not yet implemented');
  }

  async getAvailableVoices(): Promise<VoiceMetadata[]> {
    throw new Error('SelfHostedTTSProvider: not yet implemented');
  }
}
