import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import type { TTSInput, TTSOutput, TTSProvider, VoiceMetadata } from '../types.js';

const DEFAULT_VOICE = 'en-US-Chirp3-HD-Aoede';
const NEURAL2_FALLBACK = 'en-US-Neural2-D';

// USD per 1 million characters, by tier
const PRICE_PER_MILLION_CHARS: Record<'hd' | 'premium' | 'standard', number> = {
  hd:       16,
  premium:  16,
  standard:  4,
};

export function tierFromVoiceId(voiceId: string): 'hd' | 'premium' | 'standard' {
  if (voiceId.includes('Chirp3-HD')) return 'hd';
  if (voiceId.includes('Neural2') || voiceId.includes('WaveNet')) return 'premium';
  return 'standard';
}

// Google doesn't return duration in the synthesis response.
// Heuristic: synthesized English speech ~14 chars/sec at speaking rate 1.0.
function estimateDurationMs(charCount: number, speakingRate: number): number {
  return Math.round((charCount / 14) * (1_000 / speakingRate));
}

export class GoogleTTSProvider implements TTSProvider {
  readonly name = 'google' as const;
  private readonly client: TextToSpeechClient;

  constructor() {
    // SDK reads GOOGLE_APPLICATION_CREDENTIALS automatically — no explicit credential passing.
    this.client = new TextToSpeechClient();
  }

  async generateNarration(input: TTSInput): Promise<TTSOutput> {
    const speakingRate = input.speakingRate ?? 1.0;
    const pitch = input.pitch ?? 0;
    const requestedVoice = input.voiceId || DEFAULT_VOICE;

    const audioConfig = {
      audioEncoding: 'OGG_OPUS' as const,
      speakingRate,
      pitch,
    };

    let audioContent: Uint8Array | string;
    let usedVoiceId = requestedVoice;

    try {
      const [response] = await this.client.synthesizeSpeech({
        input: { text: input.text },
        voice: { languageCode: 'en-US', name: requestedVoice },
        audioConfig,
      });
      if (!response.audioContent) {
        throw new Error('Google TTS returned empty audioContent');
      }
      audioContent = response.audioContent as Uint8Array | string;
    } catch (err) {
      if (tierFromVoiceId(requestedVoice) === 'hd') {
        // HD voice unavailable — fall back to Neural2
        const [fallbackResponse] = await this.client.synthesizeSpeech({
          input: { text: input.text },
          voice: { languageCode: 'en-US', name: NEURAL2_FALLBACK },
          audioConfig,
        });
        if (!fallbackResponse.audioContent) {
          throw new Error('Google TTS Neural2 fallback returned empty audioContent');
        }
        audioContent = fallbackResponse.audioContent as Uint8Array | string;
        usedVoiceId = NEURAL2_FALLBACK;
      } else {
        throw err;
      }
    }

    const audioBuffer = Buffer.from(audioContent as Uint8Array);
    const costUsd = await this.estimateCost({ ...input, voiceId: usedVoiceId });

    return {
      audioBuffer,
      mimeType: 'audio/ogg; codecs=opus',
      durationMs: estimateDurationMs(input.text.length, speakingRate),
      characterCount: input.text.length,
      costUsd,
      provider: 'google',
      voiceId: usedVoiceId,
    };
  }

  async estimateCost(input: TTSInput): Promise<number> {
    const tier = tierFromVoiceId(input.voiceId);
    const rate = PRICE_PER_MILLION_CHARS[tier];
    return (input.text.length / 1_000_000) * rate;
  }

  async getAvailableVoices(): Promise<VoiceMetadata[]> {
    const [response] = await this.client.listVoices({ languageCode: 'en-US' });
    return (response.voices ?? [])
      .filter(v => v.name && v.languageCodes?.[0])
      .map(v => {
        const voiceId = v.name!;
        const tier = tierFromVoiceId(voiceId);
        // Proto SsmlVoiceGender: MALE=1, FEMALE=2, NEUTRAL=3
        const g = v.ssmlGender as number | null;
        let gender: VoiceMetadata['gender'] = 'neutral';
        if (g === 1) gender = 'male';
        else if (g === 2) gender = 'female';
        return {
          voiceId,
          displayName: voiceId,
          language: v.languageCodes![0]!,
          gender,
          tier,
        };
      });
  }
}
