import type { TTSInput, TTSOutput, TTSProvider, VoiceMetadata } from '../types.js';

// Requires: ELEVENLABS_API_KEY env var
// Output format: MP3 → must pass through convertToOpus() from audio-utils.ts
// TODO: implement when ElevenLabs becomes active
export class ElevenLabsTTSProvider implements TTSProvider {
  readonly name = 'elevenlabs' as const;

  async generateNarration(_input: TTSInput): Promise<TTSOutput> {
    throw new Error('ElevenLabsTTSProvider: not yet implemented');
  }

  async estimateCost(_input: TTSInput): Promise<number> {
    throw new Error('ElevenLabsTTSProvider: not yet implemented');
  }

  async getAvailableVoices(): Promise<VoiceMetadata[]> {
    throw new Error('ElevenLabsTTSProvider: not yet implemented');
  }
}
