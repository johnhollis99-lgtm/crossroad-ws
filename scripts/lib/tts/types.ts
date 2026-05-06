export type ProviderName = 'google' | 'elevenlabs' | 'openai' | 'self-hosted';

export interface TTSInput {
  text: string;
  voiceId: string;
  /** 0.25–4.0, default 1.0 */
  speakingRate?: number;
  /** -20.0 to 20.0 semitones */
  pitch?: number;
  /** default 'opus' */
  outputFormat?: 'opus' | 'mp3' | 'wav';
  /** provider-specific model selection, e.g. 'en-US-Chirp3-HD-Aoede' */
  modelOverride?: string;
}

export interface TTSOutput {
  audioBuffer: Buffer;
  /** always 'audio/ogg; codecs=opus' after normalization */
  mimeType: string;
  durationMs: number;
  characterCount: number;
  costUsd: number;
  provider: ProviderName;
  voiceId: string;
}

export interface VoiceMetadata {
  voiceId: string;
  displayName: string;
  /** BCP-47 language tag, e.g. 'en-US' */
  language: string;
  gender: 'male' | 'female' | 'neutral';
  /** pricing tier — drives cost calculation */
  tier: 'standard' | 'premium' | 'hd';
  /** optional mode hints, e.g. ['family', 'kids'] */
  recommendedFor?: string[];
}

export interface TTSProvider {
  readonly name: ProviderName;
  generateNarration(input: TTSInput): Promise<TTSOutput>;
  estimateCost(input: TTSInput): Promise<number>;
  getAvailableVoices(): Promise<VoiceMetadata[]>;
}

/** Resolved voice configuration, keyed by (mode, depth) in voice_configs table (Phase 9b) */
export interface VoiceConfig {
  provider: ProviderName;
  voiceId: string;
  speakingRate?: number;
  pitch?: number;
  modelOverride?: string;
}

export interface GenerateNarrationOptions {
  text: string;
  /** trip mode — 'driving' | 'hiking' | 'city' */
  mode: string;
  /** narration depth — 'glance' | 'ride_along' | 'deep_dive' */
  depth: string;
  providerOverride?: ProviderName;
  /** skip voice_configs lookup and use this config directly */
  voiceConfigOverride?: VoiceConfig;
}

export interface CostRecord {
  callType: 'claude' | 'tts';
  provider: string;
  /** voice_id for tts, model name for claude */
  modelOrVoice: string;
  /** character count for TTS calls */
  inputChars?: number;
  /** token counts for Claude calls */
  inputTokens?: number;
  outputTokens?: number;
  costUsd: number;
  /** narration_audio.id, poi_review_queue.id, etc. */
  relatedId?: string;
}
