import type { DJSyncRuntime, DJSyncRuntimeSnapshot } from './dj-sync-runtime.js';
import type { DJSyncService } from './dj-sync-service.js';

type SyncStatusData = Awaited<ReturnType<DJSyncService['status']>>;

export interface DJSyncApplicationSnapshot {
  schemaVersion: 2;
  generatedAt: string;
  service: SyncStatusData;
  runtime: DJSyncRuntimeSnapshot;
}

export interface DJSyncApplicationState {
  snapshot(): DJSyncApplicationSnapshot;
  refresh(): Promise<DJSyncApplicationSnapshot>;
  start(): Promise<DJSyncApplicationSnapshot>;
  stop(): Promise<DJSyncApplicationSnapshot>;
  restart(): Promise<DJSyncApplicationSnapshot>;
  subscribe(listener: (snapshot: DJSyncApplicationSnapshot) => void): () => void;
  startPolling(intervalMs?: number): void;
  stopPolling(): void;
}

const DEFAULT_POLL_INTERVAL_MS = 5000;

export function createDJSyncApplicationState(
  service: DJSyncService,
  runtime: DJSyncRuntime,
): DJSyncApplicationState {
  let currentServiceStatus: SyncStatusData | null = null;
  let pollingTimer: ReturnType<typeof setInterval> | null = null;
  let refreshInFlight = false;

  const listeners = new Set<(snapshot: DJSyncApplicationSnapshot) => void>();

  const buildSnapshot = (): DJSyncApplicationSnapshot => ({
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    service:
      currentServiceStatus ?? {
        schemaVersion: 5,
        generatedAt: new Date().toISOString(),
        service: {
          label: 'com.dj-sync-agent.sync-watch',
          loaded: false,
          state: 'unknown',
          pid: null,
        },
        database: {
          path: '',
          exists: false,
        },
        sync: {
          mode: null,
          status: null,
          sessionId: null,
          cursor: null,
          totals: {
            runs: 0,
            batchesProcessed: 0,
            scanned: 0,
            processed: 0,
          },
          lastRun: null,
        },
        server: {
          apiUrl: '',
          configured: false,
          reachable: false,
          healthy: false,
          latencyMs: null,
          version: null,
          region: null,
          deploymentId: null,
          error: null,
        },
      },
    runtime: runtime.status(),
  });

  const emit = (): void => {
    const current = buildSnapshot();
    for (const listener of listeners) {
      try {
        listener(current);
      } catch {
        // Application listeners must never break the state store.
      }
    }
  };

  runtime.subscribe(() => {
    emit();
  });

  const refresh = async (): Promise<DJSyncApplicationSnapshot> => {
    if (refreshInFlight) {
      return buildSnapshot();
    }

    refreshInFlight = true;
    try {
      try {
        currentServiceStatus = await service.status();
      } catch (error) {
        const current = currentServiceStatus;
        if (current !== null) {
          currentServiceStatus = {
            ...current,
            server: {
              ...current.server,
              reachable: false,
              healthy: false,
              error:
                error instanceof Error ? error.message : String(error),
            },
          };
        }
      }

      const current = buildSnapshot();
      emit();
      return current;
    } finally {
      refreshInFlight = false;
    }
  };

  return {
    snapshot: buildSnapshot,
    refresh,

    async start() {
      await runtime.start();
      await refresh();
      return buildSnapshot();
    },

    async stop() {
      await runtime.stop();
      await refresh();
      return buildSnapshot();
    },

    async restart() {
      await runtime.stop();
      await runtime.start();
      await refresh();
      return buildSnapshot();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    startPolling(intervalMs = DEFAULT_POLL_INTERVAL_MS) {
      if (pollingTimer !== null) {
        return;
      }
      pollingTimer = setInterval(() => {
        void refresh();
      }, intervalMs);
    },

    stopPolling() {
      if (pollingTimer === null) {
        return;
      }
      clearInterval(pollingTimer);
      pollingTimer = null;
    },
  };
}
