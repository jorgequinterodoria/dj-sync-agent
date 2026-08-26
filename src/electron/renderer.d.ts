export {};

interface AppInfo {
  name: string;
  version: string;
  electronVersion: string;
  nodeVersion: string;
  platform: NodeJS.Platform;
  arch: string;
}

interface SyncRunResult {
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

interface RuntimeSnapshot {
  status:
    | 'stopped'
    | 'starting'
    | 'running'
    | 'stopping';

  startedAt: string | null;

  lastRun: SyncRunResult | null;

  lastError: string | null;
}

type RuntimeUpdateListener = (
  snapshot: RuntimeSnapshot,
) => void;

declare global {
  interface Window {
    djSync: {
      getAppInfo(): Promise<AppInfo>;

      runtimeStart(): Promise<RuntimeSnapshot>;

      runtimeStop(): Promise<RuntimeSnapshot>;

      runtimeStatus(): Promise<RuntimeSnapshot>;

      runtimeOnUpdate(
        listener: RuntimeUpdateListener,
      ): () => void;
    };
  }
}