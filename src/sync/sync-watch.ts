import { stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  watch as chokidarWatch,
  type FSWatcher,
} from 'chokidar';

import {
  openEncryptedReadOnlyDatabase,
  close,
} from '../rekordbox/sqlcipher.js';

import type { loadConfig } from '../config/env.js';
import { runSync } from './sync-runner.js';
import {
  acquireSyncLock,
  SyncLockBusyError,
} from './sync-lock.js';
import { writeSyncState } from './sync-state.js';

type Config = ReturnType<typeof loadConfig>;

type Logger = {
  info?: (
    obj: Record<string, unknown>,
    message: string,
  ) => void;
  warn?: (
    obj: Record<string, unknown>,
    message: string,
  ) => void;
  error?: (
    obj: Record<string, unknown>,
    message: string,
  ) => void;
};

export interface SyncWatchOptions {
  config: Config;
  logger: Logger;

  debounceMs: number;
  runOnStart: boolean;
  drain: boolean;

  batchSize: number;
  maxBatches: number;

  timeoutMs: number;
  maxRetries: number;
  retryBaseMs: number;

  /** Filesystem fallback polling interval. */
  pollMs: number;

  lockPath?: string;
  statePath?: string;

  onRun?: (
    result: Awaited<ReturnType<typeof runSync>>,
  ) => void;
}

export interface SyncWatchController {
  close(): Promise<void>;
}

function numberEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw =
    process.env[name] ??
    String(fallback);

  const value = Number(raw);

  if (
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(
      `${name} must be an integer between ${min} and ${max}.`,
    );
  }

  return value;
}

function booleanEnv(
  name: string,
  fallback: boolean,
): boolean {
  const raw = process.env[name];

  if (raw === undefined) {
    return fallback;
  }

  return (
    raw === '1' ||
    raw.toLowerCase() === 'true' ||
    raw.toLowerCase() === 'yes'
  );
}

function compactPathList(
  dbPath: string,
): string[] {
  const candidates = [
    dbPath,
    `${dbPath}-wal`,
    `${dbPath}-shm`,
    `${dbPath}-journal`,
  ];

  return [...new Set(candidates)];
}

export async function startSyncWatch(
  options: SyncWatchOptions,
): Promise<SyncWatchController> {
  const dbPath =
    options.config.rekordboxDbPath;

  const lockPath =
    options.lockPath ??
    new URL(
      '../../reports/dj-sync.lock/',
      import.meta.url,
    ).pathname;

  const statePath =
    options.statePath ??
    new URL(
      '../../reports/rekordbox-sync-state.json',
      import.meta.url,
    ).pathname;

  let running = false;
  let queuedTrigger = false;
  let closed = false;

  let timer:
    ReturnType<typeof setTimeout> | null =
      null;

  let pollTimer:
    ReturnType<typeof setInterval> | null =
      null;

  let watcher: FSWatcher | null = null;

  let pollBusy = false;

  const schedule = () => {
    if (closed) {
      return;
    }

    if (timer !== null) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      void execute();
    }, options.debounceMs);
  };

  const execute = async (): Promise<void> => {
    if (closed) {
      return;
    }

    if (running) {
      queuedTrigger = true;
      return;
    }

    let lock:
      Awaited<ReturnType<typeof acquireSyncLock>> | null =
      null;

    try {
      lock = await acquireSyncLock(
        lockPath,
        'watch',
      );
    } catch (error) {
      if (error instanceof SyncLockBusyError) {
        options.logger.warn?.(
          {
            lockPath,
            holder: error.metadata,
          },
          'Sync watch skipped because another sync operation is running',
        );

        if (!closed) {
          timer = setTimeout(() => {
            timer = null;
            void execute();
          }, Math.max(options.debounceMs, 5000));
        }

        return;
      }

      throw error;
    }

    running = true;
    queuedTrigger = false;

    const startedAt =
      new Date().toISOString();

    let db:
      Awaited<
        ReturnType<
          typeof openEncryptedReadOnlyDatabase
        >
      > | null =
      null;

    try {
      try {
        await stat(dbPath);
      } catch (error) {
        options.logger.warn?.(
          {
            dbPath,
            error:
              error instanceof Error
                ? error.message
                : String(error),
          },
          'Rekordbox database is not available yet',
        );

        return;
      }

      await writeSyncState({
        path: statePath,
        mode: 'watch',
        status: 'running',
        startedAt,
        lastError: null,
      });

      options.logger.info?.(
        {
          dbPath,
          batchSize: options.batchSize,
          maxBatches: options.maxBatches,
          drain: options.drain,
        },
        'Starting automatic sync run',
      );

      db = await openEncryptedReadOnlyDatabase(
        dbPath,
        options.config.REKORDBOX_DB_KEY?.trim() ||
          undefined,
        options.config.REKORDBOX_CIPHER_COMPATIBILITY,
      );

      const outputDir =
        new URL(
          '../../reports/',
          import.meta.url,
        );

      const result = await runSync({
        db,
        cursorPath:
          new URL(
            'rekordbox-change-cursor.json',
            outputDir,
          ).pathname,
        processedBatchPath:
          new URL(
            'rekordbox-processed-change-batch.json',
            outputDir,
          ).pathname,
        envelopePath:
          new URL(
            'rekordbox-sync-envelope.json',
            outputDir,
          ).pathname,
        apiUrl:
          process.env.SYNC_API_URL ??
          'http://127.0.0.1:8787/v1/sync/batches',
        apiKey:
          process.env.SYNC_API_KEY ??
          '',
        agentId:
          process.env.SYNC_AGENT_ID ??
          '',
        batchSize: options.batchSize,
        maxBatches: options.maxBatches,
        timeoutMs: options.timeoutMs,
        maxRetries: options.maxRetries,
        retryBaseMs: options.retryBaseMs,
        logger: options.logger,
      });

      await writeSyncState({
        path: statePath,
        mode: 'watch',
        status: 'completed',
        startedAt,
        finishedAt: result.finishedAt,
        elapsedMs: result.elapsedMs,
        result,
        lastError: null,
      });

      options.onRun?.(result);

      options.logger.info?.(
        {
          batchesProcessed:
            result.batchesProcessed,
          scanned: result.scanned,
          processed: result.processed,
          completed: result.completed,
          finalCursor: result.finalCursor,
          elapsedMs: result.elapsedMs,
        },
        'Automatic sync run completed',
      );

      if (
        options.drain &&
        !result.completed &&
        result.finalCursor !== null
      ) {
        queuedTrigger = true;
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      try {
        await writeSyncState({
          path: statePath,
          mode: 'watch',
          status: 'failed',
          startedAt,
          finishedAt:
            new Date().toISOString(),
          lastError: message,
        });
      } catch {
        // Preserve the original sync failure.
      }

      options.logger.error?.(
        { error: message },
        'Automatic sync run failed',
      );
    } finally {
      if (db !== null) {
        try {
          await close(db);
        } catch (error) {
          options.logger.warn?.(
            {
              error:
                error instanceof Error
                  ? error.message
                  : String(error),
            },
            'Failed to close Rekordbox database after sync run',
          );
        }
      }

      running = false;

      if (lock !== null) {
        await lock.release();
      }

      if (!closed && queuedTrigger) {
        queuedTrigger = false;
        void execute();
      }
    }
  };

  const watchedPaths = compactPathList(dbPath);

  watcher = chokidarWatch(watchedPaths, {
    persistent: true,
    ignoreInitial: !options.runOnStart,
    usePolling: true,
    interval: 1000,
    binaryInterval: 1000,
    awaitWriteFinish: {
      stabilityThreshold: Math.max(
        200,
        options.debounceMs,
      ),
      pollInterval: 100,
    },
  });

  watcher.on('add', (path) => {
    options.logger.info?.(
      { path },
      'Rekordbox database file appeared',
    );
    schedule();
  });

  watcher.on('change', (path) => {
    options.logger.info?.(
      { path },
      'Rekordbox database file changed',
    );
    schedule();
  });

  watcher.on('unlink', (path) => {
    options.logger.warn?.(
      { path },
      'Rekordbox database file disappeared',
    );
  });

  watcher.on('error', (error) => {
    options.logger.error?.(
      {
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      'Rekordbox file watcher error',
    );

    // The periodic poll remains active even when Chokidar reports an error.
  });

  /*
   * Chokidar is the fast path. Polling is the reliability path.
   * SQLite/SQLCipher writes can be concentrated in WAL/journal files,
   * and macOS filesystem notifications are not sufficient as the only
   * trigger for a production sync agent.
   */
  pollTimer = setInterval(() => {
    if (closed || pollBusy) {
      return;
    }

    pollBusy = true;

    void stat(dbPath)
      .then(() => {
        schedule();
      })
      .catch((error) => {
        options.logger.warn?.(
          {
            dbPath,
            error:
              error instanceof Error
                ? error.message
                : String(error),
          },
          'Rekordbox polling check failed',
        );
      })
      .finally(() => {
        pollBusy = false;
      });
  }, options.pollMs);

  if (options.runOnStart) {
    schedule();
  }

  return {
    async close(): Promise<void> {
      closed = true;

      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }

      if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }

      if (watcher !== null) {
        await watcher.close();
        watcher = null;
      }
    },
  };
}

export function readSyncWatchOptions():
  Omit<
    SyncWatchOptions,
    'config' | 'logger' | 'onRun'
  > {
  return {
    debounceMs: numberEnv(
      'SYNC_WATCH_DEBOUNCE_MS',
      1500,
      100,
      60000,
    ),
    runOnStart: booleanEnv(
      'SYNC_WATCH_RUN_ON_START',
      true,
    ),
    drain: booleanEnv(
      'SYNC_WATCH_DRAIN',
      false,
    ),
    batchSize: numberEnv(
      'CHANGE_BATCH_SIZE',
      500,
      1,
      5000,
    ),
    maxBatches: numberEnv(
      'SYNC_MAX_BATCHES',
      20,
      1,
      1000,
    ),
    timeoutMs: numberEnv(
      'SYNC_TIMEOUT_MS',
      20000,
      1000,
      300000,
    ),
    maxRetries: numberEnv(
      'SYNC_MAX_RETRIES',
      4,
      0,
      20,
    ),
    retryBaseMs: numberEnv(
      'SYNC_RETRY_BASE_MS',
      1000,
      100,
      60000,
    ),
    pollMs: numberEnv(
      'SYNC_WATCH_POLL_MS',
      5000,
      1000,
      300000,
    ),
  };
}