import type { TTSInput, TTSOutput, TTSProvider, VoiceMetadata } from '../types.js';

// Requires: OPENAI_API_KEY env var
// Output format: MP3 → must pass through convertToOpus() from audio-utils.ts
// TODO: implement when OpenAI TTS becomes active
export class OpenAITTSProvider implements TTSProvider {
  readonly name = 'openai' as const;

  async generateNarration(_input: TTSInput): Promise<TTSOutput> {
    throw new Error('OpenAITTSProvider: not yet implemented');
  }

  async estimateCost(_input: TTSInput): Promise<number> {
    throw new Error('OpenAITTSProvider: not yet implemented');
  }

  async getAvailableVoices(): Promise<VoiceMetadata[]> {
    throw new Error('OpenAITTSProvider: not yet implemented');
  }
}
