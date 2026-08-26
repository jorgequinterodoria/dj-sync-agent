import type {
  NormalizedTrack,
} from '../../rekordbox/normalized-track.js';

import type {
  LibraryPage,
  LibraryTrackSummary,
} from '../../runtime/rekordbox-library.js';

export interface AppInfo {
  name: string;
  version: string;
  electronVersion: string;
  nodeVersion: string;
  platform: NodeJS.Platform;
  arch: string;
}

export interface CursorPosition {
  rbLocalUsn: number;
  id: string;
}

export interface SyncLastRun {
  startedAt: string | null;
  finishedAt: string | null;
  elapsedMs: number | null;
  batchesProcessed: number;
  scanned: number;
  processed: number;
  completed: boolean | null;

  cursorBefore:
    | CursorPosition
    | null;

  cursorAfter:
    | CursorPosition
    | null;

  lastError: string | null;
}

export interface SyncStatusData {
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

    cursor:
      | CursorPosition
      | null;

    totals: {
      runs: number;
      batchesProcessed: number;
      scanned: number;
      processed: number;
    };

    lastRun:
      | SyncLastRun
      | null;
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

export interface DJSyncApplicationSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  service: SyncStatusData;
}

export interface LibraryListOptions {
  afterId?: string | null;
  limit?: number;
  search?: string;
}

export interface DJSyncRendererApi {
  app: {
    getInfo(): Promise<AppInfo>;
  };

  application: {
    getState():
      Promise<
        DJSyncApplicationSnapshot
      >;

    refresh():
      Promise<
        DJSyncApplicationSnapshot
      >;

    start():
      Promise<
        DJSyncApplicationSnapshot
      >;

    stop():
      Promise<
        DJSyncApplicationSnapshot
      >;

    restart():
      Promise<
        DJSyncApplicationSnapshot
      >;

    subscribe(
      listener: (
        snapshot:
          DJSyncApplicationSnapshot,
      ) => void,
    ): () => void;
  };

  library: {
    list(
      options?: LibraryListOptions,
    ): Promise<LibraryPage>;

    get(
      trackId: string,
    ): Promise<NormalizedTrack>;
  };
}

export type {
  LibraryPage,
  LibraryTrackSummary,
  NormalizedTrack,
};