import { writeFile } from 'node:fs/promises';

import type { ChangeCursor } from './change-cursor.js';
import type { SyncRunResult } from './sync-runner.js';

export type SyncStateMode =
  | 'watch'
  | 'initial'
  | 'manual';

export interface SyncState {
  schemaVersion: 1;
  mode: SyncStateMode;
  status:
    | 'running'
    | 'completed'
    | 'failed';

  startedAt: string;
  updatedAt: string;

  finishedAt: string | null;
  elapsedMs: number | null;

  batchesProcessed: number;
  scanned: number;
  processed: number;

  completed: boolean | null;

  cursorBefore: ChangeCursor | null;
  cursorAfter: ChangeCursor | null;
  finalCursor: ChangeCursor | null;

  lastError: string | null;
}

export interface WriteSyncStateOptions {
  path: string;
  mode: SyncStateMode;
  status: SyncState['status'];

  startedAt: string;
  finishedAt?: string | null;
  elapsedMs?: number | null;

  result?: SyncRunResult;
  cursorBefore?: ChangeCursor | null;
  cursorAfter?: ChangeCursor | null;

  lastError?: string | null;
}

export async function writeSyncState(
  options: WriteSyncStateOptions,
): Promise<SyncState> {
  const now =
    new Date().toISOString();

  const result =
    options.result;

  const state: SyncState = {
    schemaVersion: 1,
    mode: options.mode,
    status: options.status,

    startedAt:
      options.startedAt,

    updatedAt:
      now,

    finishedAt:
      options.finishedAt ??
      null,

    elapsedMs:
      options.elapsedMs ??
      result?.elapsedMs ??
      null,

    batchesProcessed:
      result?.batchesProcessed ??
      0,

    scanned:
      result?.scanned ??
      0,

    processed:
      result?.processed ??
      0,

    completed:
      result?.completed ??
      null,

    cursorBefore:
      options.cursorBefore ??
      (
        result?.batches[0]
          ?.cursorBefore ??
        null
      ),

    cursorAfter:
      options.cursorAfter ??
      (
        result?.batches.at(-1)
          ?.cursorAfter ??
        null
      ),

    finalCursor:
      result?.finalCursor ??
      options.cursorAfter ??
      null,

    lastError:
      options.lastError ??
      null,
  };

  const temporaryPath =
    `${options.path}.tmp`;

  await writeFile(
    temporaryPath,
    JSON.stringify(
      state,
      null,
      2,
    ) + '\n',
    'utf8',
  );

  await writeFile(
    options.path,
    JSON.stringify(
      state,
      null,
      2,
    ) + '\n',
    'utf8',
  );

  return state;
}
