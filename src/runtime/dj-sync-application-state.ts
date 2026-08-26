import type {
  DJSyncService,
} from './dj-sync-service.js';

type SyncStatusData =
  Awaited<
    ReturnType<
      DJSyncService['status']
    >
  >;

export interface DJSyncApplicationSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  service: SyncStatusData;
}

export interface DJSyncApplicationState {
  snapshot(): DJSyncApplicationSnapshot;

  refresh(): Promise<DJSyncApplicationSnapshot>;

  start(): Promise<DJSyncApplicationSnapshot>;

  stop(): Promise<DJSyncApplicationSnapshot>;

  restart(): Promise<DJSyncApplicationSnapshot>;

  subscribe(
    listener: (
      snapshot: DJSyncApplicationSnapshot,
    ) => void,
  ): () => void;

  startPolling(
    intervalMs?: number,
  ): void;

  stopPolling(): void;
}

const DEFAULT_POLL_INTERVAL_MS =
  5000;

export function createDJSyncApplicationState(
  service: DJSyncService,
): DJSyncApplicationState {
  let currentServiceStatus:
    | SyncStatusData
    | null =
    null;

  let pollingTimer:
    | ReturnType<typeof setInterval>
    | null =
    null;

  let refreshInFlight =
    false;

  const listeners =
    new Set<
      (
        snapshot: DJSyncApplicationSnapshot,
      ) => void
    >();

  function buildSnapshot():
    DJSyncApplicationSnapshot {
    return {
      schemaVersion: 1,
      generatedAt:
        new Date().toISOString(),
      service:
        currentServiceStatus ??
        {
          schemaVersion: 5,
          generatedAt:
            new Date().toISOString(),
          service: {
            label:
              'com.dj-sync-agent.sync-watch',
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
    };
  }

  function emit(): void {
    const snapshot =
      buildSnapshot();

    for (
      const listener of listeners
    ) {
      try {
        listener(snapshot);
      } catch {
        // Renderer listeners must not
        // interfere with application state.
      }
    }
  }

  async function refresh():
    Promise<DJSyncApplicationSnapshot> {
    if (
      refreshInFlight
    ) {
      return buildSnapshot();
    }

    refreshInFlight = true;

    try {
      currentServiceStatus =
        await service.status();

      const snapshot =
        buildSnapshot();

      emit();

      return snapshot;
    } finally {
      refreshInFlight = false;
    }
  }

  return {
    snapshot:
      buildSnapshot,

    refresh,

    async start():
      Promise<DJSyncApplicationSnapshot> {
      currentServiceStatus =
        await service.start();

      const snapshot =
        buildSnapshot();

      emit();

      return snapshot;
    },

    async stop():
      Promise<DJSyncApplicationSnapshot> {
      currentServiceStatus =
        await service.stop();

      const snapshot =
        buildSnapshot();

      emit();

      return snapshot;
    },

    async restart():
      Promise<DJSyncApplicationSnapshot> {
      currentServiceStatus =
        await service.restart();

      const snapshot =
        buildSnapshot();

      emit();

      return snapshot;
    },

    subscribe(
      listener,
    ): () => void {
      listeners.add(
        listener,
      );

      return () => {
        listeners.delete(
          listener,
        );
      };
    },

    startPolling(
      intervalMs =
        DEFAULT_POLL_INTERVAL_MS,
    ): void {
      if (
        pollingTimer !== null
      ) {
        return;
      }

      pollingTimer =
        setInterval(
          () => {
            void refresh();
          },
          intervalMs,
        );
    },

    stopPolling(): void {
      if (
        pollingTimer === null
      ) {
        return;
      }

      clearInterval(
        pollingTimer,
      );

      pollingTimer = null;
    },
  };
}