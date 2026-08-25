import { stat } from 'node:fs/promises';
import { calculateAudioChecksum } from './audio-checksum.js';

export interface VerifiedAudioAsset {
  path: string;
  size: number;
  checksum: string;
  algorithm: 'sha256';
  bytesRead: number;
}

export async function verifyAudioAsset(
  filePath: string,
): Promise<VerifiedAudioAsset> {
  const info = await stat(filePath);

  if (!info.isFile()) {
    throw new Error(`Audio asset is not a file: ${filePath}`);
  }

  const result = await calculateAudioChecksum(filePath);

  if (result.bytesRead !== info.size) {
    throw new Error(
      `Audio asset changed while hashing: expected ${info.size} bytes, read ${result.bytesRead}.`,
    );
  }

  return {
    path: filePath,
    size: info.size,
    checksum: result.checksum,
    algorithm: result.algorithm,
    bytesRead: result.bytesRead,
  };
}