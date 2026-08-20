import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  checkSyncHealth,
  type SyncHealthResult,
} from './health-client.js';
import type { SyncState } from './sync-state.js';
import type { InitialSession } from './initial-session.js';

const execFileAsync = promisify(execFile);

export interface SyncStatusData {
  schemaVersion: 5;
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

interface StatusOptions {
  serviceLabel: string;
  databasePath: string;
  cursorPath: string;
  statePath: string;
  sessionPath: string;
  apiUrl: string;
  apiKey: string;
}

async function readJson<T>(
  path: string,
): Promise<T | null> {
  try {
    return JSON.parse(
      await readFile(
        path,
        'utf8',
      ),
    ) as T;
  } catch {
    return null;
  }
}

async function serviceStatus(
  label: string,
): Promise<
  SyncStatusData['service']
> {
  const uid =
    process.getuid?.() ?? 0;

  try {
    const { stdout } =
      await execFileAsync(
        'launchctl',
        [
          'print',
          `gui/${uid}/${label}`,
        ],
      );

    const running =
      /state = running/.test(
        stdout,
      );

    const pidMatch =
      stdout.match(
        /pid = (\d+)/,
      );

    return {
      label,
      loaded: true,
      state:
        running
          ? 'running'
          : 'stopped',
      pid:
        pidMatch
          ? Number(pidMatch[1])
          : null,
    };
  } catch {
    return {
      label,
      loaded: false,
      state: 'unknown',
      pid: null,
    };
  }
}

async function pathExists(
  path: string,
): Promise<boolean> {
  try {
    await execFileAsync(
      'test',
      ['-e', path],
    );

    return true;
  } catch {
    return false;
  }
}

async function healthCheck(
  apiUrl: string,
  apiKey: string,
): Promise<{
  health: SyncHealthResult | null;
  error: string | null;
  latencyMs: number | null;
}> {
  const started =
    performance.now();

  if (!apiUrl) {
    return {
      health: null,
      error:
        'SYNC_API_URL is not configured.',
      latencyMs: null,
    };
  }

  if (!apiKey) {
    return {
      health: null,
      error:
        'SYNC_API_KEY is not configured.',
      latencyMs: null,
    };
  }

  try {
    const health =
      await checkSyncHealth({
        url: apiUrl,
        apiKey,
        timeoutMs: 10000,
      });

    return {
      health,
      error: null,
      latencyMs:
        Math.round(
          performance.now() -
            started,
        ),
    };
  } catch (error) {
    return {
      health: null,
      error:
        error instanceof Error
          ? error.message
          : String(error),
      latencyMs:
        Math.round(
          performance.now() -
            started,
        ),
    };
  }
}

export async function buildSyncStatus(
  options: StatusOptions,
): Promise<SyncStatusData> {
  const service =
    await serviceStatus(
      options.serviceLabel,
    );

  const [
    databaseExists,
    cursorFile,
    stateFile,
    sessionFile,
    remote,
  ] = await Promise.all([
    pathExists(
      options.databasePath,
    ),
    readJson<{
      cursor?: {
        rbLocalUsn: number;
        id: string;
      } | null;
    }>(
      options.cursorPath,
    ),
    readJson<SyncState>(
      options.statePath,
    ),
    readJson<InitialSession>(
      options.sessionPath,
    ),
    healthCheck(
      options.apiUrl,
      options.apiKey,
    ),
  ]);

  const initial =
    sessionFile &&
    sessionFile.mode ===
      'initial-backfill'
      ? sessionFile
      : null;

  const state =
    stateFile &&
    stateFile.schemaVersion === 1
      ? stateFile
      : null;

  return {
    schemaVersion: 5,
    generatedAt:
      new Date().toISOString(),

    service,

    database: {
      path:
        options.databasePath,
      exists:
        databaseExists,
    },

    sync: {
      mode:
        state?.mode ??
        (
          initial
            ? 'initial'
            : null
        ),

      status:
        initial?.status ??
        state?.status ??
        null,

      sessionId:
        initial?.sessionId ??
        null,

      cursor:
        cursorFile?.cursor ??
        initial?.cursor ??
        state?.finalCursor ??
        null,

      totals: {
        runs:
          initial?.runs ??
          0,
        batchesProcessed:
          initial?.batchesProcessed ??
          0,
        scanned:
          initial?.scanned ??
          0,
        processed:
          initial?.processed ??
          0,
      },

      lastRun:
        initial
          ? {
              startedAt:
                initial.lastRun?.startedAt ??
                null,
              finishedAt:
                initial.lastRun?.finishedAt ??
                null,
              elapsedMs:
                initial.lastRun?.elapsedMs ??
                null,
              batchesProcessed:
                initial.lastRun
                  ?.batchesProcessed ??
                0,
              scanned:
                initial.lastRun?.scanned ??
                0,
              processed:
                initial.lastRun?.processed ??
                0,
              completed:
                initial.lastRun?.completed ??
                null,
              cursorBefore:
                initial.lastRun
                  ?.cursorBefore ??
                null,
              cursorAfter:
                initial.lastRun
                  ?.cursorAfter ??
                initial.cursor ??
                null,
              lastError:
                initial.lastError ??
                null,
            }
          : state
            ? {
                startedAt:
                  state.startedAt,
                finishedAt:
                  state.finishedAt,
                elapsedMs:
                  state.elapsedMs,
                batchesProcessed:
                  state.batchesProcessed,
                scanned:
                  state.scanned,
                processed:
                  state.processed,
                completed:
                  state.completed,
                cursorBefore:
                  state.cursorBefore,
                cursorAfter:
                  state.cursorAfter,
                lastError:
                  state.lastError,
              }
            : null,
    },

    server: {
      apiUrl:
        options.apiUrl,
      configured:
        Boolean(
          options.apiUrl &&
          options.apiKey,
        ),
      reachable:
        remote.health !== null,
      healthy:
        remote.health?.ok === true,
      latencyMs:
        remote.latencyMs,
      version:
        remote.health?.version ??
        null,
      region:
        remote.health?.region ??
        null,
      deploymentId:
        remote.health?.deploymentId ??
        null,
      error:
        remote.error,
    },
  };
}
