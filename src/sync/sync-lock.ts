import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';

import os from 'node:os';

export interface SyncLockMetadata {
  schemaVersion: 1;
  pid: number;
  mode: 'watch' | 'initial';
  acquiredAt: string;
  hostname: string;
}

export class SyncLockBusyError extends Error {
  readonly metadata: SyncLockMetadata | null;

  constructor(
    message: string,
    metadata: SyncLockMetadata | null,
  ) {
    super(message);
    this.name = 'SyncLockBusyError';
    this.metadata = metadata;
  }
}

export interface SyncLock {
  path: string;
  metadata: SyncLockMetadata;
  release(): Promise<void>;
}

async function readMetadata(
  lockPath: string,
): Promise<SyncLockMetadata | null> {
  try {
    const raw = await readFile(
      `${lockPath}/metadata.json`,
      'utf8',
    );

    const parsed =
      JSON.parse(raw) as Partial<SyncLockMetadata>;

    if (
      parsed.schemaVersion !== 1 ||
      typeof parsed.pid !== 'number' ||
      !Number.isInteger(parsed.pid) ||
      typeof parsed.mode !== 'string' ||
      typeof parsed.acquiredAt !== 'string' ||
      typeof parsed.hostname !== 'string'
    ) {
      return null;
    }

    if (
      parsed.mode !== 'watch' &&
      parsed.mode !== 'initial'
    ) {
      return null;
    }

    return {
      schemaVersion: 1,
      pid: parsed.pid,
      mode: parsed.mode,
      acquiredAt: parsed.acquiredAt,
      hostname: parsed.hostname,
    };
  } catch {
    return null;
  }
}

function isProcessAlive(
  pid: number,
): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code =
      error &&
      typeof error === 'object' &&
      'code' in error
        ? String(
            (error as { code?: unknown }).code,
          )
        : null;

    return code === 'EPERM';
  }
}

export async function acquireSyncLock(
  lockPath: string,
  mode: SyncLockMetadata['mode'],
): Promise<SyncLock> {
  const metadata: SyncLockMetadata = {
    schemaVersion: 1,
    pid: process.pid,
    mode,
    acquiredAt:
      new Date().toISOString(),
    hostname: os.hostname(),
  };

  try {
    await mkdir(lockPath);
  } catch (error) {
    const code =
      error &&
      typeof error === 'object' &&
      'code' in error
        ? String(
            (error as { code?: unknown }).code,
          )
        : null;

    if (code !== 'EEXIST') {
      throw error;
    }

    const existing =
      await readMetadata(
        lockPath,
      );

    if (
      existing &&
      isProcessAlive(existing.pid)
    ) {
      throw new SyncLockBusyError(
        `Sync lock is held by pid ${existing.pid} (${existing.mode}) since ${existing.acquiredAt}.`,
        existing,
      );
    }

    /*
     * Stale lock: owner no longer exists or metadata is unreadable.
     * Remove it and make one atomic acquisition attempt.
     */
    await rm(
      lockPath,
      {
        recursive: true,
        force: true,
      },
    );

    try {
      await mkdir(lockPath);
    } catch (retryError) {
      const retryCode =
        retryError &&
        typeof retryError === 'object' &&
        'code' in retryError
          ? String(
              (
                retryError as {
                  code?: unknown;
                }
              ).code,
            )
          : null;

      if (retryCode === 'EEXIST') {
        const current =
          await readMetadata(
            lockPath,
          );

        throw new SyncLockBusyError(
          'Sync lock is currently held by another process.',
          current,
        );
      }

      throw retryError;
    }
  }

  try {
    await writeFile(
      `${lockPath}/metadata.json`,
      JSON.stringify(
        metadata,
        null,
        2,
      ) + '\n',
      {
        encoding: 'utf8',
        flag: 'wx',
      },
    );
  } catch (error) {
    await rm(
      lockPath,
      {
        recursive: true,
        force: true,
      },
    );

    throw error;
  }

  let released = false;

  return {
    path: lockPath,
    metadata,

    async release(): Promise<void> {
      if (released) {
        return;
      }

      released = true;

      const current =
        await readMetadata(
          lockPath,
        );

      /*
       * Never remove a lock that was taken over by another process.
       */
      if (
        !current ||
        current.pid !== metadata.pid ||
        current.mode !== metadata.mode
      ) {
        return;
      }

      await rm(
        lockPath,
        {
          recursive: true,
          force: true,
        },
      );
    },
  };
}
