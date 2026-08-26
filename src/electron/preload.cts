import electron = require('electron');

interface AppInfo {
  name: string;
  version: string;
  electronVersion: string;
  nodeVersion: string;
  platform: NodeJS.Platform;
  arch: string;
}

interface RuntimeSnapshot {
  status:
    | 'stopped'
    | 'starting'
    | 'running'
    | 'stopping';

  startedAt: string | null;

  lastRun: {
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
  } | null;

  lastError: string | null;
}

type RuntimeUpdateListener = (
  snapshot: RuntimeSnapshot,
) => void;

const electronApi = Object.freeze({
  getAppInfo: (): Promise<AppInfo> =>
    electron.ipcRenderer.invoke(
      'app:get-info',
    ),

  runtimeStart: (): Promise<RuntimeSnapshot> =>
    electron.ipcRenderer.invoke(
      'runtime:start',
    ),

  runtimeStop: (): Promise<RuntimeSnapshot> =>
    electron.ipcRenderer.invoke(
      'runtime:stop',
    ),

  runtimeStatus: (): Promise<RuntimeSnapshot> =>
    electron.ipcRenderer.invoke(
      'runtime:status',
    ),

  runtimeOnUpdate: (
    listener: RuntimeUpdateListener,
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      snapshot: RuntimeSnapshot,
    ): void => {
      listener(snapshot);
    };

    electron.ipcRenderer.on(
      'runtime:update',
      handler,
    );

    return () => {
      electron.ipcRenderer.removeListener(
        'runtime:update',
        handler,
      );
    };
  },
});

electron.contextBridge.exposeInMainWorld(
  'djSync',
  electronApi,
);