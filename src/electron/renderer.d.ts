export {};

declare global {
  interface AppInfo {
    name: string;
    version: string;
    electronVersion: string;
    nodeVersion: string;
    platform: NodeJS.Platform;
    arch: string;
  }

  interface RuntimeSnapshot {
    status: string;
    startedAt: string | null;
    lastRun: unknown;
    lastError: string | null;
  }

  interface DJSyncApi {
    getAppInfo(): Promise<AppInfo>;

    runtimeStart(): Promise<RuntimeSnapshot>;

    runtimeStop(): Promise<RuntimeSnapshot>;

    runtimeStatus(): Promise<RuntimeSnapshot>;

    onRuntimeUpdate(
      listener: (
        snapshot: RuntimeSnapshot,
      ) => void,
    ): () => void;
  }

  interface Window {
    djSync: DJSyncApi;
  }
}