import type { SqliteDatabase } from '../rekordbox/sqlcipher.js';
import { scanChangeBatch } from './change-scanner.js';
import type { ChangeCursor } from './change-cursor.js';

export interface PaginationVerificationReport {
  schemaVersion: 1;
  generatedAt: string;
  elapsedMs: number;
  batchSize: number;
  batchesProcessed: number;
  rowsProcessed: number;
  uniqueIds: number;
  duplicateIds: number;
  activeRows: number;
  deletedRows: number;
  orderingViolations: number;
  cursorRegressions: number;
  firstCursor: ChangeCursor | null;
  lastCursor: ChangeCursor | null;
  usnGroups: {
    first: number | null;
    last: number | null;
    distinct: number;
    transitions: number;
  };
  complete: boolean;
}

function compareCursor(a: ChangeCursor, b: ChangeCursor): number {
  if (a.rbLocalUsn !== b.rbLocalUsn) {
    return a.rbLocalUsn < b.rbLocalUsn ? -1 : 1;
  }
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/**
 * Full read-only audit of the (rb_local_usn, ID) ordering.
 *
 * This deliberately uses an in-memory cursor and never changes the
 * persisted production cursor. It is safe to run against the live DB.
 */
export async function verifyPagination(
  db: SqliteDatabase,
  batchSize = 500,
): Promise<PaginationVerificationReport> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5000) {
    throw new Error('batchSize must be an integer between 1 and 5000.');
  }

  const startedAt = performance.now();

  let cursor: ChangeCursor | null = null;
  let previousCursor: ChangeCursor | null = null;
  let previousRowCursor: ChangeCursor | null = null;

  const seenIds = new Set<string>();
  const seenUsns = new Set<number>();

  let batchesProcessed = 0;
  let rowsProcessed = 0;
  let duplicateIds = 0;
  let orderingViolations = 0;
  let cursorRegressions = 0;
  let activeRows = 0;
  let deletedRows = 0;

  let firstCursor: ChangeCursor | null = null;
  let lastCursor: ChangeCursor | null = null;

  let previousUsn: number | null = null;
  let usnTransitions = 0;

  while (true) {
    const batch = await scanChangeBatch(db, cursor, batchSize);
    batchesProcessed += 1;

    if (previousCursor && batch.cursorBefore) {
      if (compareCursor(previousCursor, batch.cursorBefore) !== 0) {
        cursorRegressions += 1;
      }
    }

    for (const candidate of batch.candidates) {
      const currentCursor: ChangeCursor = {
        rbLocalUsn: candidate.rbLocalUsn,
        id: candidate.id,
      };

      if (!firstCursor) firstCursor = currentCursor;
      lastCursor = currentCursor;

      if (previousRowCursor && compareCursor(previousRowCursor, currentCursor) >= 0) {
        orderingViolations += 1;
      }
      previousRowCursor = currentCursor;

      if (seenIds.has(candidate.id)) {
        duplicateIds += 1;
      } else {
        seenIds.add(candidate.id);
      }

      seenUsns.add(candidate.rbLocalUsn);

      if (previousUsn !== null && previousUsn !== candidate.rbLocalUsn) {
        usnTransitions += 1;
      }
      previousUsn = candidate.rbLocalUsn;

      rowsProcessed += 1;

      if (candidate.rbLocalDeleted === 0) {
        activeRows += 1;
      } else {
        deletedRows += 1;
      }
    }

    if (batch.cursorAfter && previousCursor) {
      if (compareCursor(previousCursor, batch.cursorAfter) >= 0) {
        cursorRegressions += 1;
      }
    }

    previousCursor = batch.cursorAfter;
    cursor = batch.cursorAfter;

    if (!batch.hasMore) break;

    if (!batch.cursorAfter || batch.returned === 0) {
      throw new Error(
        'Invalid pagination state: hasMore=true without a usable next cursor.',
      );
    }

    if (batchesProcessed % 10 === 0) {
      console.log(
        `[pagination] batches=${batchesProcessed} rows=${rowsProcessed} ` +
        `active=${activeRows} deleted=${deletedRows} usns=${seenUsns.size}`,
      );
    }
  }

  const elapsedMs = Math.round(performance.now() - startedAt);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    elapsedMs,
    batchSize,
    batchesProcessed,
    rowsProcessed,
    uniqueIds: seenIds.size,
    duplicateIds,
    activeRows,
    deletedRows,
    orderingViolations,
    cursorRegressions,
    firstCursor,
    lastCursor,
    usnGroups: {
      first: firstCursor?.rbLocalUsn ?? null,
      last: lastCursor?.rbLocalUsn ?? null,
      distinct: seenUsns.size,
      transitions: usnTransitions,
    },
    complete:
      duplicateIds === 0 &&
      orderingViolations === 0 &&
      cursorRegressions === 0,
  };
}
