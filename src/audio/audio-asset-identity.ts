import { stat } from 'node:fs/promises';

export interface AudioAssetIdentity {
  path: string;
  size: number;
  mtimeMs: number;
}

export async function resolveAudioAssetIdentity(
  filePath: string,
): Promise<AudioAssetIdentity | null> {
  try {
    const info = await stat(filePath);

    if (!info.isFile()) {
      return null;
    }

    return {
      path: filePath,
      size: info.size,
      mtimeMs: Math.trunc(info.mtimeMs),
    };
  } catch {
    return null;
  }
}