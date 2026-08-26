import { loadConfig } from '../config/env.js';
import { createLogger } from '../logger/logger.js';
import {
  readSyncWatchOptions,
  startSyncWatch,
  type SyncWatchController,
} from '../sync/sync-watch.js';

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
  status: DJSyncRuntimeStatus;
  startedAt: string | null;
  lastRun: DJSyncRuntimeLastRun | null;
  lastError: string | null;
}

export type DJSyncRuntimeListener = (
  snapshot: DJSyncRuntimeSnapshot,
) => void;

export interface DJSyncRuntime {
  start(): Promise<DJSyncRuntimeSnapshot>;
  stop(): Promise<DJSyncRuntimeSnapshot>;
  status(): DJSyncRuntimeSnapshot;
  subscribe(listener: DJSyncRuntimeListener): () => void;
}

export function createDJSyncRuntime(): DJSyncRuntime {
  let runtimeStatus: DJSyncRuntimeStatus =
    'stopped';

  let controller: SyncWatchController | null =
    null;

  let startedAt: string | null = null;

  let lastRun: DJSyncRuntimeLastRun | null =
    null;

  let lastError: string | null = null;

  const listeners =
    new Set<DJSyncRuntimeListener>();

  const snapshot =
    (): DJSyncRuntimeSnapshot => ({
      status: runtimeStatus,
      startedAt,
      lastRun,
      lastError,
    });

  const emit = (): void => {
    const currentSnapshot = snapshot();

    for (const listener of listeners) {
      try {
        listener(currentSnapshot);
      } catch {
        // A renderer/listener must never break
        // the runtime itself.
      }
    }
  };

  return {
    async start(): Promise<DJSyncRuntimeSnapshot> {
      if (
        runtimeStatus === 'running' ||
        runtimeStatus === 'starting'
      ) {
        return snapshot();
      }

      if (runtimeStatus === 'stopping') {
        throw new Error(
          'DJ Sync runtime is stopping.',
        );
      }

      runtimeStatus = 'starting';
      startedAt = new Date().toISOString();
      lastError = null;

      emit();

      try {
        const config = loadConfig();
        const logger = createLogger(config);
        const options = readSyncWatchOptions();

        controller = await startSyncWatch({
          config,
          logger,
          ...options,

          onRun: (result) => {
            lastRun = result;
            lastError = null;

            emit();
          },
        });

        runtimeStatus = 'running';

        emit();

        return snapshot();
      } catch (error) {
        runtimeStatus = 'stopped';
        controller = null;

        lastError =
          error instanceof Error
            ? error.message
            : String(error);

        emit();

        throw error;
      }
    },

    async stop(): Promise<DJSyncRuntimeSnapshot> {
      if (runtimeStatus === 'stopped') {
        return snapshot();
      }

      if (runtimeStatus === 'stopping') {
        return snapshot();
      }

      runtimeStatus = 'stopping';

      emit();

      try {
        if (controller !== null) {
          await controller.close();
        }

        controller = null;
        runtimeStatus = 'stopped';

        emit();

        return snapshot();
      } catch (error) {
        lastError =
          error instanceof Error
            ? error.message
            : String(error);

        runtimeStatus = 'stopped';
        controller = null;

        emit();

        throw error;
      }
    },

    status(): DJSyncRuntimeSnapshot {
      return snapshot();
    },

    subscribe(
      listener: DJSyncRuntimeListener,
    ): () => void {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}