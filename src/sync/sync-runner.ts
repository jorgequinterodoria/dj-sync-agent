import { readFile, writeFile } from 'node:fs/promises';

import type { SqliteDatabase } from '../rekordbox/sqlcipher.js';
import type { ChangeCursor } from './change-cursor.js';
import { processChangeBatch } from './change-processor.js';
import {
  buildSyncEnvelope,
  type ProcessedChangeBatch,
  type ProcessedChangeRecord,
} from './sync-envelope.js';
import { pushSyncEnvelope } from './sync-client.js';

export interface SyncRunOptions {
  db: SqliteDatabase;
  cursorPath: string;
  processedBatchPath: string;
  envelopePath: string;
  apiUrl: string;
  apiKey: string;
  agentId: string;
  batchSize: number;
  maxBatches: number;
  timeoutMs: number;
  maxRetries: number;
  retryBaseMs: number;
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

export interface SyncRunBatchResult {
  batchNumber: number;
  scanned: number;
  processed: number;
  hasMore: boolean;
  duplicate: boolean;
  cursorBefore: ChangeCursor | null;
  cursorAfter: ChangeCursor | null;
  messageId: string;
  idempotencyKey: string;
}

export interface SyncRunResult {
  schemaVersion: 1;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  batchesProcessed: number;
  scanned: number;
  processed: number;
  completed: boolean;
  finalCursor: ChangeCursor | null;
  batches: SyncRunBatchResult[];
}

async function readCursor(
  filePath: string,
): Promise<ChangeCursor | null> {
  try {
    const raw = await readFile(
      filePath,
      'utf8',
    );

    const parsed = JSON.parse(raw) as {
      schemaVersion?: number;
      cursor?: ChangeCursor | null;
    };

    if (parsed.schemaVersion !== 1) {
      throw new Error(
        'Unsupported persisted cursor schema version.',
      );
    }

    if (parsed.cursor == null) {
      return null;
    }

    if (
      typeof parsed.cursor.rbLocalUsn !==
        'number' ||
      !Number.isFinite(
        parsed.cursor.rbLocalUsn,
      ) ||
      typeof parsed.cursor.id !==
        'string' ||
      parsed.cursor.id.length === 0
    ) {
      throw new Error(
        'Invalid persisted cursor.',
      );
    }

    return {
      rbLocalUsn:
        parsed.cursor.rbLocalUsn,
      id:
        parsed.cursor.id,
    };
  } catch (error) {
    const code =
      error &&
      typeof error === 'object' &&
      'code' in error
        ? String(
            (
              error as {
                code?: unknown;
              }
            ).code,
          )
        : null;

    if (code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function writeCursor(
  filePath: string,
  cursor: ChangeCursor | null,
): Promise<void> {
  const payload = {
    schemaVersion: 1,
    cursor,
    updatedAt:
      new Date().toISOString(),
  };

  await writeFile(
    filePath,
    JSON.stringify(
      payload,
      null,
      2,
    ) + '\n',
    'utf8',
  );
}

function sameCursor(
  a: ChangeCursor | null,
  b: ChangeCursor | null,
): boolean {
  if (a === null || b === null) {
    return a === b;
  }

  return (
    a.rbLocalUsn === b.rbLocalUsn &&
    a.id === b.id
  );
}

async function sleep(
  milliseconds: number,
): Promise<void> {
  await new Promise<void>(
    (resolve) =>
      setTimeout(
        resolve,
        milliseconds,
      ),
  );
}

function isRetryable(
  error: unknown,
): boolean {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  return (
    message.includes('HTTP 408') ||
    message.includes('HTTP 429') ||
    message.includes('HTTP 500') ||
    message.includes('HTTP 502') ||
    message.includes('HTTP 503') ||
    message.includes('HTTP 504') ||
    message.includes('timed out')
  );
}

async function pushWithRetry(
  envelope: Parameters<
    typeof pushSyncEnvelope
  >[0],
  options: {
    url: string;
    apiKey: string;
    agentId: string;
    timeoutMs: number;
    maxRetries: number;
    retryBaseMs: number;
  },
) {
  for (
    let attempt = 0;
    ;
    attempt += 1
  ) {
    try {
      return await pushSyncEnvelope(
        envelope,
        {
          url:
            options.url,
          apiKey:
            options.apiKey,
          agentId:
            options.agentId,
          timeoutMs:
            options.timeoutMs,
        },
      );
    } catch (error) {
      if (
        attempt >=
          options.maxRetries ||
        !isRetryable(error)
      ) {
        throw error;
      }

      await sleep(
        options.retryBaseMs *
          2 ** attempt,
      );
    }
  }
}

function toEnvelopeBatch(
  processed: Awaited<
    ReturnType<
      typeof processChangeBatch
    >
  >,
): ProcessedChangeBatch {
  const changes: ProcessedChangeRecord[] =
    processed.changes.map(
      (
        change,
      ): ProcessedChangeRecord => {
        const action:
          ProcessedChangeRecord['action'] =
          change.action === 'delete'
            ? 'delete'
            : 'update';

        return {
          action,
          id:
            change.id,
          uuid:
            change.uuid,
          hash:
            change.hash,
          track:
            change.track,
          rbLocalUsn:
            change.rbLocalUsn,
          updatedAt:
            change.updatedAt,
        };
      },
    );

  const unchanged =
    Math.max(
      0,
      processed.processed -
        changes.length,
    );

  return {
    schemaVersion:
      processed.schemaVersion,
    cursorBefore:
      processed.cursorBefore,
    cursorAfter:
      processed.cursorAfter,
    hasMore:
      processed.hasMore,
    scanned:
      processed.scanned,
    active:
      processed.active,
    deleted:
      processed.deleted,
    processed:
      processed.processed,
    unchanged,
    changes,
  };
}

export async function runSync(
  options: SyncRunOptions,
): Promise<SyncRunResult> {
  if (
    !Number.isInteger(
      options.batchSize,
    ) ||
    options.batchSize < 1 ||
    options.batchSize > 5000
  ) {
    throw new Error(
      'batchSize must be between 1 and 5000.',
    );
  }

  if (
    !Number.isInteger(
      options.maxBatches,
    ) ||
    options.maxBatches < 1 ||
    options.maxBatches > 1000
  ) {
    throw new Error(
      'maxBatches must be between 1 and 1000.',
    );
  }

  if (
    !Number.isInteger(
      options.maxRetries,
    ) ||
    options.maxRetries < 0 ||
    options.maxRetries > 10
  ) {
    throw new Error(
      'maxRetries must be between 0 and 10.',
    );
  }

  const startedAt =
    new Date();

  const startedMs =
    performance.now();

  const batches:
    SyncRunBatchResult[] = [];

  let scannedTotal = 0;
  let processedTotal = 0;
  let completed = false;

  while (
    batches.length <
    options.maxBatches
  ) {
    const cursorBefore =
      await readCursor(
        options.cursorPath,
      );

    const processed =
      await processChangeBatch(
        options.db,
        cursorBefore,
        options.batchSize,
      );

    if (
      !sameCursor(
        processed.cursorBefore,
        cursorBefore,
      )
    ) {
      throw new Error(
        'Processed batch cursorBefore does not match persisted cursor.',
      );
    }

    await writeFile(
      options.processedBatchPath,
      JSON.stringify(
        processed,
        null,
        2,
      ) + '\n',
      'utf8',
    );

    scannedTotal +=
      processed.scanned;

    processedTotal +=
      processed.processed;

    /*
     * Do not send an empty batch.
     *
     * An empty batch produces the same deterministic envelope every time
     * for the same cursor. Sending it repeatedly makes the server return
     * duplicate=true on every polling cycle. An empty, terminal batch is
     * already a successful no-op: keep the cursor unchanged and finish.
     */
    if (
      processed.processed === 0 &&
      !processed.hasMore
    ) {
      completed = true;

      options.logger?.info?.(
        {
          scanned:
            processed.scanned,
          processed:
            processed.processed,
          cursor:
            processed.cursorAfter ??
            processed.cursorBefore ??
            cursorBefore,
        },
        'No changes detected; sync run completed without pushing an empty batch',
      );

      break;
    }

    const envelopeBatch =
      toEnvelopeBatch(
        processed,
      );

    const envelope =
      buildSyncEnvelope(
        envelopeBatch,
      );

    const persistedBefore =
      await readCursor(
        options.cursorPath,
      );

    if (
      !sameCursor(
        persistedBefore,
        envelope.cursor.before,
      )
    ) {
      throw new Error(
        'Persisted cursor changed unexpectedly before push.',
      );
    }

    await writeFile(
      options.envelopePath,
      JSON.stringify(
        envelope,
        null,
        2,
      ) + '\n',
      'utf8',
    );

    const ack =
      await pushWithRetry(
        envelope,
        {
          url:
            options.apiUrl,
          apiKey:
            options.apiKey,
          agentId:
            options.agentId,
          timeoutMs:
            options.timeoutMs,
          maxRetries:
            options.maxRetries,
          retryBaseMs:
            options.retryBaseMs,
        },
      );

    if (
      ack.accepted !== true
    ) {
      throw new Error(
        'Server ACK was not accepted.',
      );
    }

    if (
      !sameCursor(
        ack.cursor.before,
        envelope.cursor.before,
      ) ||
      !sameCursor(
        ack.cursor.after,
        envelope.cursor.after,
      )
    ) {
      throw new Error(
        'Server ACK cursor does not match the pushed envelope.',
      );
    }

    if (
      envelope.cursor.after &&
      !sameCursor(
        await readCursor(
          options.cursorPath,
        ),
        envelope.cursor.after,
      )
    ) {
      await writeCursor(
        options.cursorPath,
        envelope.cursor.after,
      );
    }

    const batchNumber =
      batches.length + 1;

    batches.push({
      batchNumber,
      scanned:
        processed.scanned,
      processed:
        processed.processed,
      hasMore:
        processed.hasMore,
      duplicate:
        ack.duplicate,
      cursorBefore:
        processed.cursorBefore,
      cursorAfter:
        processed.cursorAfter,
      messageId:
        envelope.message.id,
      idempotencyKey:
        envelope.message
          .idempotencyKey,
    });

    options.logger?.info?.(
      {
        batchNumber,
        scanned:
          processed.scanned,
        processed:
          processed.processed,
        duplicate:
          ack.duplicate,
        cursorBefore:
          processed.cursorBefore,
        cursorAfter:
          processed.cursorAfter,
        hasMore:
          processed.hasMore,
      },
      'Sync batch completed',
    );

    if (
      !processed.hasMore
    ) {
      completed = true;
      break;
    }

    if (
      !processed.cursorAfter
    ) {
      throw new Error(
        'Batch reports hasMore=true but cursorAfter is null.',
      );
    }
  }

  const finishedAt =
    new Date();

  return {
    schemaVersion: 1,
    startedAt:
      startedAt.toISOString(),
    finishedAt:
      finishedAt.toISOString(),
    elapsedMs: Math.round(
      performance.now() -
        startedMs,
    ),
    batchesProcessed:
      batches.length,
    scanned:
      scannedTotal,
    processed:
      processedTotal,
    completed,
    finalCursor:
      await readCursor(
        options.cursorPath,
      ),
    batches,
  };
}