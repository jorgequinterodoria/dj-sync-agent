import { readFile, writeFile } from 'node:fs/promises';

import type { SqliteDatabase } from '../rekordbox/sqlcipher.js';
import {
  runSync,
  type SyncRunResult,
} from './sync-runner.js';
import {
  acquireSyncLock,
} from './sync-lock.js';
import {
  writeSyncState,
} from './sync-state.js';
import {
  createOrResumeInitialSession,
  writeInitialSession,
  type InitialSession,
} from './initial-session.js';

export interface InitialSyncOptions {
  db: SqliteDatabase;
  cursorPath: string;
  processedBatchPath: string;
  envelopePath: string;
  checkpointPath: string;
  statePath: string;
  sessionPath: string;
  apiUrl: string;
  apiKey: string;
  agentId: string;
  batchSize: number;
  maxBatches: number;
  timeoutMs: number;
  maxRetries: number;
  retryBaseMs: number;
  lockPath?: string;
  logger?: {
    info?: (
      obj: Record<string, unknown>,
      message: string,
    ) => void;
    warn?: (
      obj: Record<string, unknown>,
      message: string,
    ) => void;
  };
}

export interface InitialSyncCheckpoint {
  schemaVersion: 3;
  mode: 'initial-backfill';
  sessionId: string;
  startedAt: string;
  updatedAt: string;
  runs: number;
  batchesProcessed: number;
  scanned: number;
  processed: number;
  completed: boolean;
  cursor: {
    rbLocalUsn: number;
    id: string;
  } | null;
  lastRun: {
    startedAt: string;
    finishedAt: string;
    elapsedMs: number;
    batchesProcessed: number;
    scanned: number;
    processed: number;
    completed: boolean;
    cursorBefore: {
      rbLocalUsn: number;
      id: string;
    } | null;
    cursorAfter: {
      rbLocalUsn: number;
      id: string;
    } | null;
  } | null;
}

async function writeCheckpoint(
  path: string,
  checkpoint: InitialSyncCheckpoint,
): Promise<void> {
  const tmp =
    `${path}.tmp`;

  const text =
    JSON.stringify(
      checkpoint,
      null,
      2,
    ) + '\n';

  await writeFile(
    tmp,
    text,
    'utf8',
  );

  await writeFile(
    path,
    text,
    'utf8',
  );
}

function summariseRun(
  result: SyncRunResult,
): NonNullable<
  InitialSession['lastRun']
> {
  return {
    startedAt:
      result.startedAt,
    finishedAt:
      result.finishedAt,
    elapsedMs:
      result.elapsedMs,
    batchesProcessed:
      result.batchesProcessed,
    scanned:
      result.scanned,
    processed:
      result.processed,
    completed:
      result.completed,
    cursorBefore:
      result.batches[0]?.cursorBefore ??
      null,
    cursorAfter:
      result.batches.at(-1)?.cursorAfter ??
      result.finalCursor ??
      null,
  };
}

function mergeRunIntoSession(
  session: InitialSession,
  result: SyncRunResult,
): InitialSession {
  return {
    ...session,
    status:
      result.completed
        ? 'completed'
        : 'paused',
    runs:
      session.runs + 1,
    batchesProcessed:
      session.batchesProcessed +
      result.batchesProcessed,
    scanned:
      session.scanned +
      result.scanned,
    processed:
      session.processed +
      result.processed,
    cursor:
      result.finalCursor,
    lastRun:
      summariseRun(result),
    lastError:
      null,
  };
}

function checkpointFromSession(
  session: InitialSession,
): InitialSyncCheckpoint {
  const run =
    session.lastRun;

  if (!run) {
    return {
      schemaVersion: 3,
      mode:
        'initial-backfill',
      sessionId:
        session.sessionId,
      startedAt:
        session.startedAt,
      updatedAt:
        session.updatedAt,
      runs:
        session.runs,
      batchesProcessed:
        session.batchesProcessed,
      scanned:
        session.scanned,
      processed:
        session.processed,
      completed:
        session.status ===
        'completed',
      cursor:
        session.cursor,
      lastRun:
        null,
    };
  }

  return {
    schemaVersion: 3,
    mode:
      'initial-backfill',
    sessionId:
      session.sessionId,
    startedAt:
      session.startedAt,
    updatedAt:
      session.updatedAt,
    runs:
      session.runs,
    batchesProcessed:
      session.batchesProcessed,
    scanned:
      session.scanned,
    processed:
      session.processed,
    completed:
      session.status ===
      'completed',
    cursor:
      session.cursor,
    lastRun: {
      startedAt:
        run.startedAt ??
        session.startedAt,
      finishedAt:
        run.finishedAt ??
        session.updatedAt,
      elapsedMs:
        run.elapsedMs ??
        0,
      batchesProcessed:
        run.batchesProcessed,
      scanned:
        run.scanned,
      processed:
        run.processed,
      completed:
        run.completed ??
        false,
      cursorBefore:
        run.cursorBefore ??
        null,
      cursorAfter:
        run.cursorAfter ??
        session.cursor ??
        null,
    },
  };
}

export async function runInitialSync(
  options: InitialSyncOptions,
): Promise<InitialSyncCheckpoint> {
  const lockPath =
    options.lockPath ??
    new URL(
      '../../reports/dj-sync.lock/',
      import.meta.url,
    ).pathname;

  const lock =
    await acquireSyncLock(
      lockPath,
      'initial',
    );

  const startedAt =
    new Date().toISOString();

  let session:
    InitialSession | null =
    null;

  try {
    session =
      await createOrResumeInitialSession(
        options.sessionPath,
      );

    if (
      session.status ===
      'completed'
    ) {
      throw new Error(
        `Initial backfill session ${session.sessionId} is already completed.`,
      );
    }

    session = {
      ...session,
      status:
        'running',
      lastError:
        null,
    };

    await writeInitialSession(
      options.sessionPath,
      session,
    );

    await writeSyncState({
      path:
        options.statePath,
      mode:
        'initial',
      status:
        'running',
      startedAt,
      lastError:
        null,
    });

    const result =
      await runSync({
        db:
          options.db,
        cursorPath:
          options.cursorPath,
        processedBatchPath:
          options.processedBatchPath,
        envelopePath:
          options.envelopePath,
        apiUrl:
          options.apiUrl,
        apiKey:
          options.apiKey,
        agentId:
          options.agentId,
        batchSize:
          options.batchSize,
        maxBatches:
          options.maxBatches,
        timeoutMs:
          options.timeoutMs,
        maxRetries:
          options.maxRetries,
        retryBaseMs:
          options.retryBaseMs,
        ...(options.logger
          ? {
              logger:
                options.logger,
            }
          : {}),
      });

    session =
      mergeRunIntoSession(
        session,
        result,
      );

    await writeInitialSession(
      options.sessionPath,
      session,
    );

    const checkpoint =
      checkpointFromSession(
        session,
      );

    await writeCheckpoint(
      options.checkpointPath,
      checkpoint,
    );

    await writeSyncState({
      path:
        options.statePath,
      mode:
        'initial',
      status:
        'completed',
      startedAt,
      finishedAt:
        result.finishedAt,
      elapsedMs:
        result.elapsedMs,
      result,
      lastError:
        null,
    });

    return checkpoint;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    if (session) {
      await writeInitialSession(
        options.sessionPath,
        {
          ...session,
          status:
            'failed',
          lastError:
            message,
        },
      );
    }

    await writeSyncState({
      path:
        options.statePath,
      mode:
        'initial',
      status:
        'failed',
      startedAt,
      finishedAt:
        new Date().toISOString(),
      lastError:
        message,
    });

    throw error;
  } finally {
    await lock.release();
  }
}
