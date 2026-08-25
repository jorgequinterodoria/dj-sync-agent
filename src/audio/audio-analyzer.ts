import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface AudioAnalysisResult {
  durationSeconds: number | null;
  sampleRate: number | null;
  channels: number | null;
  bitrate: number | null;
  codec: string | null;
}

export async function analyzeAudioFile(
  filePath: string,
): Promise<AudioAnalysisResult> {
  if (!filePath.trim()) {
    throw new Error('Audio file path is required.');
  }

  let stdout: string;

  try {
    ({ stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v', 'error',
        '-select_streams', 'a:0',
        '-show_entries',
        'stream=duration,sample_rate,channels,bit_rate,codec_name',
        '-of', 'json',
        filePath,
      ],
      { maxBuffer: 1024 * 1024 },
    ));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`ffprobe audio analysis failed: ${message}`);
  }

  const parsed = JSON.parse(stdout) as {
    streams?: Array<{
      duration?: string;
      sample_rate?: string;
      channels?: number;
      bit_rate?: string;
      codec_name?: string;
    }>;
  };

  const stream = parsed.streams?.[0];
  if (!stream) {
    throw new Error(`No audio stream found in: ${filePath}`);
  }

  const numberOrNull = (value: string | number | undefined): number | null => {
    if (value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  return {
    durationSeconds: numberOrNull(stream.duration),
    sampleRate: numberOrNull(stream.sample_rate),
    channels: numberOrNull(stream.channels),
    bitrate: numberOrNull(stream.bit_rate),
    codec: typeof stream.codec_name === 'string' ? stream.codec_name : null,
  };
}