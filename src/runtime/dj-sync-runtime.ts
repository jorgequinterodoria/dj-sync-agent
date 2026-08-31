import { loadConfig } from '../config/env.js';
import { createLogger } from '../logger/logger.js';
import {
  readSyncWatchOptions,
  startSyncWatch,
  type SyncWatchController,
} from '../sync/sync-watch.js';
import type { DJSyncJobRuntime, DJSyncJobRuntimeSnapshot } from './dj-sync-job-runtime.js';

export interface DJSyncRuntimeLastRun {
  schemaVersion: number;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  batchesProcessed: number;
  scanned: number;
  processed: number;
  completed: boolean;
  finalCursor: {
    rbLocalUsn: number;
    id: string;
  } | null;
}

export type DJSyncRuntimeStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping';

export interface DJSyncRuntimeSnapshot {
  schemaVersion: 2;
  status: DJSyncRuntimeStatus;
  startedAt: string | null;
  lastRun: DJSyncRuntimeLastRun | null;
  lastError: string | null;
  jobs: DJSyncJobRuntimeSnapshot;
}

export type DJSyncRuntimeListener = (
  snapshot: DJSyncRuntimeSnapshot,
) => void;

export interface DJSyncRuntimeOptions {
  jobRuntime?: DJSyncJobRuntime | null;
  startSyncWatch?: (
    onRun: (result: DJSyncRuntimeLastRun) => void,
  ) => Promise<SyncWatchController>;
}

export interface DJSyncRuntime {
  start(): Promise<DJSyncRuntimeSnapshot>;
  stop(): Promise<DJSyncRuntimeSnapshot>;
  status(): DJSyncRuntimeSnapshot;
  subscribe(listener: DJSyncRuntimeListener): () => void;
}

const disabledJobs = (): DJSyncJobRuntimeSnapshot => ({
  configured: false,
  status: 'disabled',
  workerId: null,
  startedAt: null,
  lastRunAt: null,
  lastRun: null,
  lastError: null,
  totals: {
    claimed: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
  },
});

export function createDJSyncRuntime(
  options: DJSyncRuntimeOptions = {},
): DJSyncRuntime {
  let runtimeStatus: DJSyncRuntimeStatus = 'stopped';
  let controller: SyncWatchController | null = null;
  let startedAt: string | null = null;
  let lastRun: DJSyncRuntimeLastRun | null = null;
  let lastError: string | null = null;

  const jobRuntime = options.jobRuntime ?? null;
  const listeners = new Set<DJSyncRuntimeListener>();

  let stopPromise: Promise<DJSyncRuntimeSnapshot> | null = null;

  const snapshot = (): DJSyncRuntimeSnapshot => ({
    schemaVersion: 2,
    status: runtimeStatus,
    startedAt,
    lastRun,
    lastError,
    jobs: jobRuntime?.snapshot() ?? disabledJobs(),
  });

  const emit = (): void => {
    const current = snapshot();
    for (const listener of listeners) {
      try {
        listener(current);
      } catch {
        // Runtime listeners must never break the coordinator.
      }
    }
  };

  const startWatch =
    options.startSyncWatch ??
    (async (onRun) => {
      const config = loadConfig();
      const logger = createLogger(config);
      const watchOptions = readSyncWatchOptions();
      return startSyncWatch({
        config,
        logger,
        ...watchOptions,
        onRun,
      });
    });

  return {
    async start() {
      if (runtimeStatus === 'running' || runtimeStatus === 'starting') {
        return snapshot();
      }

      if (runtimeStatus === 'stopping') {
        throw new Error('DJ Sync runtime is stopping.');
      }

      runtimeStatus = 'starting';
      startedAt = new Date().toISOString();
      lastError = null;
      emit();

      try {
        controller = await startWatch((result) => {
          lastRun = result;
          emit();
        });

        if (jobRuntime !== null) {
          try {
            await jobRuntime.start();
          } catch (error) {
            lastError =
              error instanceof Error ? error.message : String(error);
            emit();
          }
        }

        runtimeStatus = 'running';
        emit();
        return snapshot();
      } catch (error) {
        try {
          await controller?.close();
        } catch {
          // Preserve the startup error.
        }

        controller = null;
        runtimeStatus = 'stopped';
        lastError =
          error instanceof Error ? error.message : String(error);
        emit();
        throw error;
      }
    },

    async stop() {
      if (stopPromise !== null) {
        return stopPromise;
      }

      if (runtimeStatus === 'stopped') {
        return snapshot();
      }

      runtimeStatus = 'stopping';
      emit();

      stopPromise = (async () => {
        let stopError: unknown = null;

        if (jobRuntime !== null) {
          try {
            await jobRuntime.stop();
          } catch (error) {
            stopError = error;
          }
        }

        if (controller !== null) {
          try {
            await controller.close();
          } catch (error) {
            stopError ??= error;
          }
        }

        controller = null;
        runtimeStatus = 'stopped';

        if (stopError !== null) {
          lastError =
            stopError instanceof Error
              ? stopError.message
              : String(stopError);
        }

        emit();
        return snapshot();
      })();

      try {
        return await stopPromise;
      } finally {
        stopPromise = null;
      }
    },

    status: snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
