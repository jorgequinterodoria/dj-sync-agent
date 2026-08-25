import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

const DEFAULT_ALGORITHM = 'sha256' as const;
const DEFAULT_CHUNK_SIZE = 1024 * 1024;

export interface AudioChecksumResult {
  checksum: string;
  algorithm: typeof DEFAULT_ALGORITHM;
  bytesRead: number;
}

export async function calculateAudioChecksum(
  filePath: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
): Promise<AudioChecksumResult> {
  if (!filePath.trim()) {
    throw new Error('Audio file path is required.');
  }

  if (!Number.isInteger(chunkSize) || chunkSize < 64 * 1024) {
    throw new Error('chunkSize must be an integer >= 65536 bytes.');
  }

  const hash = createHash(DEFAULT_ALGORITHM);
  let bytesRead = 0;
  const stream = createReadStream(filePath, { highWaterMark: chunkSize });

  try {
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      hash.update(buffer);
      bytesRead += buffer.length;
    }
  } catch (error) {
    stream.destroy();
    throw error;
  }

  return {
    checksum: hash.digest('hex'),
    algorithm: DEFAULT_ALGORITHM,
    bytesRead,
  };
}