// Used only by providers that don't natively output Opus.
// Google outputs OGG_OPUS natively — skip this for Google.
// ElevenLabs and OpenAI output MP3 and must pass through here.

import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export type SourceFormat = 'mp3' | 'wav' | 'pcm';

/**
 * Converts an audio buffer to Opus inside an OGG container.
 * Writes to tmp files, runs ffmpeg, reads back, and cleans up.
 */
export async function convertToOpus(
  buffer: Buffer,
  sourceFormat: SourceFormat,
): Promise<Buffer> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'xroad-tts-'));
  const inputPath = join(tmpDir, `input.${sourceFormat}`);
  const outputPath = join(tmpDir, 'output.ogg');

  try {
    await writeFile(inputPath, buffer);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec('libopus')
        .audioBitrate('48k')
        .format('ogg')
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });

    return await readFile(outputPath);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
