interface AppInfo {
  name: string;
  version: string;
  electronVersion: string;
  nodeVersion: string;
  platform: NodeJS.Platform;
  arch: string;
}

interface SyncStatusData {
  schemaVersion: number;
  generatedAt: string;

  service: {
    label: string;
    loaded: boolean;
    state:
      | 'running'
      | 'stopped'
      | 'unknown';
    pid: number | null;
  };

  database: {
    path: string;
    exists: boolean;
  };

  sync: {
    mode:
      | 'watch'
      | 'initial'
      | 'manual'
      | null;

    status:
      | 'running'
      | 'completed'
      | 'paused'
      | 'failed'
      | null;

    sessionId: string | null;

    cursor: {
      rbLocalUsn: number;
      id: string;
    } | null;

    totals: {
      runs: number;
      batchesProcessed: number;
      scanned: number;
      processed: number;
    };

    lastRun: {
      startedAt: string | null;
      finishedAt: string | null;
      elapsedMs: number | null;
      batchesProcessed: number;
      scanned: number;
      processed: number;
      completed: boolean | null;

      cursorBefore: {
        rbLocalUsn: number;
        id: string;
      } | null;

      cursorAfter: {
        rbLocalUsn: number;
        id: string;
      } | null;

      lastError: string | null;
    } | null;
  };

  server: {
    apiUrl: string;
    configured: boolean;
    reachable: boolean;
    healthy: boolean;
    latencyMs: number | null;
    version: string | null;
    region: string | null;
    deploymentId: string | null;
    error: string | null;
  };
}

interface DJSyncApi {
  getAppInfo(): Promise<AppInfo>;

  serviceStatus(): Promise<SyncStatusData>;

  serviceStart(): Promise<SyncStatusData>;

  serviceStop(): Promise<SyncStatusData>;

  serviceRestart(): Promise<SyncStatusData>;

  onServiceUpdate(
    listener: (
      snapshot: SyncStatusData,
    ) => void,
  ): () => void;
}

interface Window {
  djSync: DJSyncApi;
}